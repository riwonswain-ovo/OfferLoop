import { spawnSync } from 'node:child_process';
import { hostname } from 'node:os';
import { resolve } from 'node:path';

import { startCodexRun } from './codex-runner.mjs';
import { createWorkerClient } from './worker-client.mjs';

const VERSION = '0.2.0';
const DEFAULT_WORKBENCH_URL =
  'https://ccn3d1ndeqey.aiforce.cloud/app/app_17abq8v4k7k';
const KEYCHAIN_SERVICE = 'OfferLoop Agent Worker';
const KEYCHAIN_ACCOUNT = 'app_17abq8v4k7k';

const CODEX_BIN = process.env.CODEX_BIN ?? 'codex';
const WORKSPACE = resolve(process.env.OFFERLOOP_WORKSPACE ?? '../..');
const WORKBENCH_URL =
  process.env.OFFERLOOP_WORKBENCH_URL ?? DEFAULT_WORKBENCH_URL;
const WORKER_ID = process.env.OFFERLOOP_WORKER_ID ?? 'offerloop-mac';
const WORKER_NAME =
  process.env.OFFERLOOP_WORKER_NAME ?? `${hostname()} · OfferLoop`;
const POLL_INTERVAL_MS = Math.max(
  1_000,
  Number(process.env.OFFERLOOP_POLL_INTERVAL_MS ?? '3000'),
);

let shuttingDown = false;

function sleep(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

function readApiKey() {
  if (process.env.OFFERLOOP_WORKBENCH_API_KEY) {
    return process.env.OFFERLOOP_WORKBENCH_API_KEY;
  }
  if (process.platform !== 'darwin') {
    return '';
  }
  const lookup = spawnSync(
    '/usr/bin/security',
    [
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      KEYCHAIN_ACCOUNT,
      '-w',
    ],
    {
      encoding: 'utf8',
      timeout: 5_000,
    },
  );
  return lookup.status === 0 ? lookup.stdout.trim() : '';
}

function checkCodex() {
  const result = spawnSync(CODEX_BIN, ['--version'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  return result.status === 0;
}

async function executeTask(client, task) {
  let latestProgress = '正在启动 OfferLoop Agent';
  let latestResult = '';
  let latestSessionId = task.sessionId;
  const sendProgress = async () => {
    await client.updateRun(task.runId, {
      progress: latestProgress,
      sessionId: latestSessionId,
      status: 'running',
      workerId: WORKER_ID,
    });
  };

  const { completion } = startCodexRun({
    codexBin: CODEX_BIN,
    confirmed: task.confirmed,
    message: task.message,
    onUpdate: (update) => {
      if (typeof update.progress === 'string') {
        latestProgress = update.progress;
      }
      if (typeof update.result === 'string') {
        latestResult = update.result;
      }
      if (typeof update.sessionId === 'string') {
        latestSessionId = update.sessionId;
      }
    },
    route: task.route,
    sessionId: task.sessionId,
    workspace: WORKSPACE,
  });

  await sendProgress();
  const progressTimer = setInterval(() => {
    void sendProgress().catch((error) => {
      process.stderr.write(
        `Unable to update Agent progress: ${error.message}\n`,
      );
    });
  }, 15_000);

  const outcome = await completion;
  clearInterval(progressTimer);
  if (outcome.ok && latestResult) {
    await client.updateRun(task.runId, {
      progress: '已完成',
      result: latestResult,
      sessionId: latestSessionId,
      status: 'completed',
      workerId: WORKER_ID,
    });
    return;
  }

  await client.updateRun(task.runId, {
    error: outcome.error ?? 'Codex 没有返回最终结果',
    progress: '任务失败',
    sessionId: latestSessionId,
    status: 'failed',
    workerId: WORKER_ID,
  });
}

async function run() {
  const apiKey = readApiKey();
  if (!apiKey) {
    throw new Error(
      'OfferLoop Workbench API key is missing from the environment or Keychain',
    );
  }
  const client = createWorkerClient({
    apiKey,
    baseUrl: WORKBENCH_URL,
  });

  process.stdout.write(
    `OfferLoop Agent Worker ${VERSION} started for ${WORKBENCH_URL}\n`,
  );
  process.stdout.write(`Workspace: ${WORKSPACE}\n`);

  let retryDelayMs = POLL_INTERVAL_MS;
  while (!shuttingDown) {
    try {
      const codexAvailable = checkCodex();
      const response = await client.poll({
        codexAvailable,
        displayName: WORKER_NAME,
        version: VERSION,
        workerId: WORKER_ID,
      });
      retryDelayMs = POLL_INTERVAL_MS;
      if (response.task) {
        await executeTask(client, response.task);
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      process.stderr.write(`OfferLoop Agent Worker: ${error.message}\n`);
      await sleep(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
  });
}

run().catch((error) => {
  process.stderr.write(`OfferLoop Agent Worker stopped: ${error.message}\n`);
  process.exitCode = 1;
});
