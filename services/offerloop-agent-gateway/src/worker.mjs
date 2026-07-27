import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  signalCodexProcess,
  startCodexArchive,
  startCodexRun,
} from './codex-runner.mjs';
import { createWorkerClient } from './worker-client.mjs';

const VERSION = '0.6.0';
const CODEX_ARCHIVE_ROUTE = '__codex_archive__';
const FORCE_STOP_DELAY_MS = 2_000;
const DEFAULT_WORKBENCH_URL =
  'https://ccn3d1ndeqey.aiforce.cloud/app/app_17abq8v4k7k';
const KEYCHAIN_SERVICE = 'OfferLoop Agent Worker';
const KEYCHAIN_ACCOUNT = 'app_17abq8v4k7k';

const CODEX_BIN = process.env.CODEX_BIN ?? 'codex';
const SOURCE_ROOT = resolve(
  process.env.OFFERLOOP_SOURCE_ROOT ??
    process.env.OFFERLOOP_WORKSPACE ??
    '../..',
);
const RUNTIME_WORKSPACE = resolve(
  process.env.OFFERLOOP_RUNTIME_WORKSPACE ??
    join(tmpdir(), 'offerloop-agent-runtime'),
);
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
let activeChild = null;

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
  let cancellationRequested = false;
  let child = null;
  let forceStopTimer = null;
  let communicationFailure = null;
  const stopChild = () => {
    if (!child) {
      return;
    }
    signalCodexProcess(child, 'SIGTERM');
    if (!forceStopTimer) {
      forceStopTimer = setTimeout(() => {
        signalCodexProcess(child, 'SIGKILL');
      }, FORCE_STOP_DELAY_MS);
      forceStopTimer.unref?.();
    }
  };
  const sendProgress = async () => {
    if (cancellationRequested) {
      return { cancelRequested: true };
    }
    const response = await client.updateRun(task.runId, {
      progress: latestProgress,
      sessionId: latestSessionId,
      status: 'running',
      workerId: WORKER_ID,
    });
    if (response.cancelRequested) {
      cancellationRequested = true;
      latestProgress = '正在停止任务';
      stopChild();
    }
    return response;
  };

  // Verify that the result channel is writable before starting Codex. If this
  // request fails, the lease expires and the UI can recover without an orphan.
  await sendProgress();
  if (cancellationRequested) {
    await client.updateRun(task.runId, {
      progress: '任务已停止',
      result: '任务已停止。',
      sessionId: latestSessionId,
      status: 'cancelled',
      workerId: WORKER_ID,
    });
    return;
  }

  const onUpdate = (update) => {
    if (typeof update.progress === 'string') {
      latestProgress = update.progress;
    }
    if (typeof update.result === 'string') {
      latestResult = update.result;
    }
    if (typeof update.sessionId === 'string') {
      latestSessionId = update.sessionId;
    }
  };
  const archiveTask = task.route === CODEX_ARCHIVE_ROUTE;
  const execution = archiveTask
    ? startCodexArchive({
        codexBin: CODEX_BIN,
        onUpdate,
        sessionId: task.sessionId,
        workspace: RUNTIME_WORKSPACE,
      })
    : startCodexRun({
        codexBin: CODEX_BIN,
        confirmed: task.confirmed,
        message: task.message,
        onUpdate,
        route: task.route,
        sessionId: task.sessionId,
        sourceRoot: SOURCE_ROOT,
        workspace: RUNTIME_WORKSPACE,
      });
  child = execution.child;
  activeChild = child;

  const progressTimer = setInterval(() => {
    void sendProgress().catch((error) => {
      communicationFailure ??= error;
      process.stderr.write(
        `Unable to update Agent progress: ${error.message}\n`,
      );
      stopChild();
    });
  }, 2_000);

  const outcome = await execution.completion;
  clearInterval(progressTimer);
  activeChild = null;
  if (forceStopTimer) {
    clearTimeout(forceStopTimer);
  }
  if (communicationFailure) {
    throw new Error(
      `Agent result channel failed: ${communicationFailure.message}`,
    );
  }
  if (cancellationRequested) {
    await client.updateRun(task.runId, {
      progress: '任务已停止',
      result: '任务已停止。',
      sessionId: latestSessionId,
      status: 'cancelled',
      workerId: WORKER_ID,
    });
    return;
  }
  if (outcome.ok && (latestResult || archiveTask)) {
    const response = await client.updateRun(task.runId, {
      progress: '已完成',
      result: archiveTask ? '该对话已归档到 Codex。' : latestResult,
      sessionId: latestSessionId,
      status: 'completed',
      workerId: WORKER_ID,
    });
    if (response.cancelRequested) {
      await client.updateRun(task.runId, {
        progress: '任务已停止',
        result: '任务已停止。',
        sessionId: latestSessionId,
        status: 'cancelled',
        workerId: WORKER_ID,
      });
    }
    return;
  }

  const response = await client.updateRun(task.runId, {
    error: outcome.error ?? 'Codex 没有返回最终结果',
    progress: '任务失败',
    sessionId: latestSessionId,
    status: 'failed',
    workerId: WORKER_ID,
  });
  if (response.cancelRequested) {
    await client.updateRun(task.runId, {
      progress: '任务已停止',
      result: '任务已停止。',
      sessionId: latestSessionId,
      status: 'cancelled',
      workerId: WORKER_ID,
    });
  }
}

async function run() {
  mkdirSync(RUNTIME_WORKSPACE, { recursive: true });
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
  process.stdout.write(`Read-only OfferLoop root: ${SOURCE_ROOT}\n`);
  process.stdout.write(`Writable runtime cache: ${RUNTIME_WORKSPACE}\n`);

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
    if (activeChild) {
      signalCodexProcess(activeChild, 'SIGTERM');
      const forceStopTimer = setTimeout(() => {
        signalCodexProcess(activeChild, 'SIGKILL');
      }, FORCE_STOP_DELAY_MS);
      forceStopTimer.unref?.();
    }
  });
}

run().catch((error) => {
  process.stderr.write(`OfferLoop Agent Worker stopped: ${error.message}\n`);
  process.exitCode = 1;
});
