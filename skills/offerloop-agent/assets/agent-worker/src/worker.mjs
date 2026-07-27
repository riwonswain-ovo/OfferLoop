import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createCodexAppServerClient } from './codex-app-server-client.mjs';
import { createWorkerClient } from './worker-client.mjs';

const VERSION = '0.8.3';
const CODEX_ARCHIVE_ROUTE = '__codex_archive__';
const CODEX_NEW_THREAD_ROUTE = '__codex_new_thread__';
const KEYCHAIN_SERVICE = 'OfferLoop Agent Worker';

const CODEX_BIN = process.env.CODEX_BIN ?? 'codex';
const SOURCE_ROOT_VALUE =
  process.env.OFFERLOOP_SOURCE_ROOT ?? process.env.OFFERLOOP_WORKSPACE ?? '';
const SOURCE_ROOT = SOURCE_ROOT_VALUE ? resolve(SOURCE_ROOT_VALUE) : '';
const RUNTIME_WORKSPACE = resolve(
  process.env.OFFERLOOP_RUNTIME_WORKSPACE ??
    join(tmpdir(), 'offerloop-agent-runtime'),
);
const WORKBENCH_URL = process.env.OFFERLOOP_WORKBENCH_URL ?? '';
const WORKBENCH_APP_ID =
  process.env.OFFERLOOP_WORKBENCH_APP_ID ??
  WORKBENCH_URL.match(/\/(app_[a-zA-Z0-9]+)(?:[/?#]|$)/u)?.[1] ??
  '';
const KEYCHAIN_ACCOUNT = WORKBENCH_APP_ID;
const OWNER_ID =
  process.env.OFFERLOOP_MIAODA_USER_ID ??
  process.env.OFFERLOOP_FEISHU_USER_ID ??
  '';
const DEFAULT_WORKER_ID = `offerloop-${OWNER_ID}-${hostname()}`
  .replace(/[^a-zA-Z0-9._-]/gu, '-')
  .slice(0, 128);
const WORKER_ID = process.env.OFFERLOOP_WORKER_ID ?? DEFAULT_WORKER_ID;
const WORKER_NAME =
  process.env.OFFERLOOP_WORKER_NAME ?? `${hostname()} · OfferLoop`;
const CONFIGURED_POLL_INTERVAL_MS = Number(
  process.env.OFFERLOOP_POLL_INTERVAL_MS ?? '1000',
);
const POLL_INTERVAL_MS = Number.isFinite(CONFIGURED_POLL_INTERVAL_MS)
  ? Math.max(500, CONFIGURED_POLL_INTERVAL_MS)
  : 1_000;

let shuttingDown = false;
let appServerClient = null;

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

async function executeTask(client, codexClient, task) {
  let latestProgress = '正在启动 OfferLoop Agent';
  let latestResult = '';
  let latestSessionId = task.sessionId;
  let cancellationRequested = false;
  let communicationFailure = null;
  const stopTurn = async () => {
    try {
      const interrupted = await codexClient.interrupt();
      if (!interrupted) {
        codexClient.close();
      }
    } catch {
      codexClient.close();
    }
  };
  const sendProgress = async () => {
    if (cancellationRequested) {
      return { cancelRequested: true };
    }
    const response = await client.updateRun(task.runId, {
      progress: latestProgress,
      result: latestResult || undefined,
      sessionId: latestSessionId,
      status: 'running',
      workerId: WORKER_ID,
    });
    if (response.cancelRequested) {
      cancellationRequested = true;
      latestProgress = '正在停止任务';
      await stopTurn();
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
  const newThreadTask = task.route === CODEX_NEW_THREAD_ROUTE;
  let completion;
  try {
    if (archiveTask) {
      latestProgress = '正在归档 Codex 对话';
      await codexClient.archive(task.sessionId);
      completion = Promise.resolve({ ok: true });
    } else if (newThreadTask) {
      latestProgress = '正在创建 Codex 对话';
      const execution = await codexClient.createVisibleThread({ onUpdate });
      latestSessionId = execution.threadId;
      completion = execution.completion.then((outcome) => {
        if (outcome.ok) {
          latestResult = '新对话已创建。';
        }
        return outcome;
      });
    } else {
      const execution = await codexClient.runTurn({
        confirmed: task.confirmed,
        message: task.message,
        onUpdate,
        route: task.route,
        sessionId: task.sessionId,
      });
      latestSessionId = execution.threadId;
      completion = execution.completion;
    }
  } catch (error) {
    completion = Promise.resolve({ error: error.message, ok: false });
  }

  const progressTimer = setInterval(() => {
    void sendProgress().catch((error) => {
      communicationFailure ??= error;
      process.stderr.write(
        `Unable to update Agent progress: ${error.message}\n`,
      );
      void stopTurn();
    });
  }, 750);

  const outcome = await completion;
  clearInterval(progressTimer);
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
  if (!SOURCE_ROOT) {
    throw new Error('OFFERLOOP_SOURCE_ROOT is required');
  }
  if (!WORKBENCH_URL || !WORKBENCH_APP_ID) {
    throw new Error(
      'OFFERLOOP_WORKBENCH_URL and a valid workbench App ID are required',
    );
  }
  if (!/^[0-9]{1,255}$/u.test(OWNER_ID)) {
    throw new Error(
      'OFFERLOOP_MIAODA_USER_ID is required and must be the numeric req.userContext.userId; Feishu open_id values are not accepted',
    );
  }
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
    ownerId: OWNER_ID,
  });
  appServerClient = createCodexAppServerClient({
    codexBin: CODEX_BIN,
    runtimeWorkspace: RUNTIME_WORKSPACE,
    sourceRoot: SOURCE_ROOT,
  });
  await appServerClient.start();

  process.stdout.write(
    `OfferLoop Agent Worker ${VERSION} started for ${WORKBENCH_URL} as ${OWNER_ID}\n`,
  );
  process.stdout.write(`Read-only OfferLoop root: ${SOURCE_ROOT}\n`);
  process.stdout.write(`Writable runtime cache: ${RUNTIME_WORKSPACE}\n`);

  let retryDelayMs = POLL_INTERVAL_MS;
  while (!shuttingDown) {
    try {
      const response = await client.poll({
        codexAvailable: true,
        displayName: WORKER_NAME,
        version: VERSION,
        workerId: WORKER_ID,
      });
      retryDelayMs = POLL_INTERVAL_MS;
      if (response.task) {
        await executeTask(client, appServerClient, response.task);
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
    appServerClient?.close();
  });
}

run().catch((error) => {
  process.stderr.write(`OfferLoop Agent Worker stopped: ${error.message}\n`);
  process.exitCode = 1;
});
