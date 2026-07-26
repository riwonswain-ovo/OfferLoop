import { spawnSync } from 'node:child_process';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { startCodexRun } from './codex-runner.mjs';

const HOST = process.env.OFFERLOOP_GATEWAY_HOST ?? '127.0.0.1';
const PORT = Number(process.env.OFFERLOOP_GATEWAY_PORT ?? '4715');
const TOKEN = process.env.OFFERLOOP_GATEWAY_TOKEN ?? '';
const CODEX_BIN = process.env.CODEX_BIN ?? 'codex';
const WORKSPACE = resolve(process.env.OFFERLOOP_WORKSPACE ?? '../..');
const MAX_CONCURRENT_RUNS = Math.max(
  1,
  Number(process.env.OFFERLOOP_MAX_CONCURRENT_RUNS ?? '2'),
);
const MAX_BODY_BYTES = 64 * 1024;
const RUN_RETENTION_MS = 24 * 60 * 60 * 1000;
const RUN_ID_PATTERN = /^[0-9a-f-]{36}$/u;

if (!TOKEN || TOKEN.length < 16) {
  process.stderr.write(
    'OFFERLOOP_GATEWAY_TOKEN must contain at least 16 characters.\n',
  );
  process.exit(1);
}

const codexCheck = spawnSync(CODEX_BIN, ['--version'], {
  encoding: 'utf8',
  timeout: 5_000,
});
const CODEX_AVAILABLE = codexCheck.status === 0;
const runs = new Map();
const queue = [];
let activeRuns = 0;

function tokenDigest(value) {
  return createHash('sha256').update(value).digest();
}

function isAuthorized(request) {
  const authorization = request.headers.authorization ?? '';
  const expected = tokenDigest(`Bearer ${TOKEN}`);
  const actual = tokenDigest(authorization);
  return timingSafeEqual(expected, actual);
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body is too large');
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function publicRun(run) {
  return {
    runId: run.runId,
    status: run.status,
    progress: run.progress,
    result: run.result,
    error: run.error,
    sessionId: run.sessionId,
  };
}

function updateRun(run, update) {
  if (typeof update.progress === 'string') {
    run.progress = update.progress;
  }
  if (typeof update.result === 'string') {
    run.result = update.result;
  }
  if (typeof update.error === 'string') {
    run.error = update.error;
  }
  if (typeof update.sessionId === 'string') {
    run.sessionId = update.sessionId;
  }
  run.updatedAt = Date.now();
}

async function executeRun(run) {
  activeRuns += 1;
  run.status = 'running';
  run.progress = '正在启动 OfferLoop Agent';
  run.updatedAt = Date.now();

  const { child, completion } = startCodexRun({
    codexBin: CODEX_BIN,
    confirmed: run.confirmed,
    message: run.message,
    onUpdate: (update) => updateRun(run, update),
    route: run.route,
    sessionId: run.sessionId,
    workspace: WORKSPACE,
  });
  run.process = child;

  const outcome = await completion;
  run.process = undefined;
  if (outcome.ok && run.result) {
    run.status = 'completed';
    run.progress = '已完成';
  } else {
    run.status = 'failed';
    run.progress = '任务失败';
    run.error =
      run.error ?? outcome.error ?? 'Codex did not return a final response';
  }
  run.updatedAt = Date.now();
  activeRuns -= 1;
  pumpQueue();
}

function pumpQueue() {
  while (activeRuns < MAX_CONCURRENT_RUNS && queue.length > 0) {
    const run = queue.shift();
    if (run) {
      void executeRun(run);
    }
  }
}

function validateCreateRun(body) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : undefined;
  const route =
    typeof body.route === 'string' && body.route.trim()
      ? body.route.trim()
      : 'auto';

  if (!message || message.length > 8_000) {
    throw new Error('message must contain 1 to 8000 characters');
  }
  if (!userId || userId.length > 256) {
    throw new Error('userId is required');
  }
  if (sessionId && sessionId.length > 256) {
    throw new Error('sessionId is invalid');
  }
  if (route.length > 128) {
    throw new Error('route is invalid');
  }

  return {
    confirmed: body.confirmed === true,
    message,
    route,
    sessionId,
    userId,
  };
}

async function handleCreateRun(request, response) {
  const body = await readJsonBody(request);
  const input = validateCreateRun(body);
  const headerUserId = request.headers['x-offerloop-user-id'];
  if (headerUserId !== input.userId) {
    sendJson(response, 403, { error: 'User identity mismatch' });
    return;
  }

  const existingRun = [...runs.values()].find(
    (run) =>
      run.userId === input.userId &&
      (run.status === 'queued' || run.status === 'running'),
  );
  if (existingRun) {
    sendJson(response, 409, {
      error: 'This user already has an active run',
      runId: existingRun.runId,
    });
    return;
  }

  const run = {
    runId: randomUUID(),
    status: 'queued',
    progress: '任务已进入队列',
    result: undefined,
    error: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...input,
  };
  runs.set(run.runId, run);
  queue.push(run);
  pumpQueue();
  sendJson(response, 202, {
    runId: run.runId,
    status: run.status,
  });
}

function handleGetRun(request, response, runId) {
  const run = runs.get(runId);
  if (!run) {
    sendJson(response, 404, { error: 'Run not found' });
    return;
  }
  const userId = request.headers['x-offerloop-user-id'];
  if (userId !== run.userId) {
    sendJson(response, 403, { error: 'Run belongs to another user' });
    return;
  }
  sendJson(response, 200, publicRun(run));
}

function handleCancelRun(request, response, runId) {
  const run = runs.get(runId);
  if (!run) {
    sendJson(response, 404, { error: 'Run not found' });
    return;
  }
  const userId = request.headers['x-offerloop-user-id'];
  if (userId !== run.userId) {
    sendJson(response, 403, { error: 'Run belongs to another user' });
    return;
  }
  if (run.status === 'running' && run.process) {
    run.process.kill('SIGTERM');
  }
  if (run.status === 'queued') {
    const index = queue.findIndex((queuedRun) => queuedRun.runId === runId);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  }
  run.status = 'failed';
  run.progress = '任务已取消';
  run.error = 'Cancelled by user';
  run.updatedAt = Date.now();
  sendJson(response, 200, publicRun(run));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${HOST}:${String(PORT)}`);
    if (url.pathname === '/health' && request.method === 'GET') {
      if (!isAuthorized(request)) {
        sendJson(response, 401, { error: 'Unauthorized' });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        service: 'offerloop-agent-gateway',
        codexAvailable: CODEX_AVAILABLE,
      });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    if (url.pathname === '/v1/runs' && request.method === 'POST') {
      await handleCreateRun(request, response);
      return;
    }

    const runMatch = url.pathname.match(/^\/v1\/runs\/([0-9a-f-]{36})$/u);
    const runId = runMatch?.[1];
    if (runId && RUN_ID_PATTERN.test(runId) && request.method === 'GET') {
      handleGetRun(request, response, runId);
      return;
    }
    if (runId && RUN_ID_PATTERN.test(runId) && request.method === 'DELETE') {
      handleCancelRun(request, response, runId);
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(response, 400, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `OfferLoop Agent Gateway listening on http://${HOST}:${String(PORT)}\n`,
  );
  process.stdout.write(`Workspace: ${WORKSPACE}\n`);
  process.stdout.write(
    `Codex runtime: ${CODEX_AVAILABLE ? 'available' : 'unavailable'}\n`,
  );
});

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - RUN_RETENTION_MS;
  for (const [runId, run] of runs.entries()) {
    if (
      run.updatedAt < cutoff &&
      run.status !== 'running' &&
      run.status !== 'queued'
    ) {
      runs.delete(runId);
    }
  }
}, 60 * 60 * 1000);
cleanupTimer.unref();
