import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAppServerArgs,
  createCodexAppServerClient,
  normalizeThreadTitle,
} from '../src/codex-app-server-client.mjs';

function createFakeCodexProcess() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    return true;
  };
  child.stdin = new PassThrough();
  let buffer = '';
  const requests = [];
  const send = (message) => {
    child.stdout.write(`${JSON.stringify(message)}\n`);
  };
  child.stdin.setEncoding('utf8');
  child.stdin.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const request = JSON.parse(line);
      requests.push(request);
      if (request.method === 'initialize') {
        send({ id: request.id, result: {} });
      } else if (request.method === 'thread/start') {
        send({
          id: request.id,
          result: { thread: { id: '019fa268-8999-79b1-bef7-d2a43bfc81a6' } },
        });
      } else if (request.method === 'thread/name/set') {
        send({ id: request.id, result: {} });
      } else if (request.method === 'turn/start') {
        const threadId = request.params.threadId;
        const turnId = '019fa268-a999-7777-bef7-d2a43bfc81a6';
        send({ id: request.id, result: { turn: { id: turnId } } });
        send({
          method: 'item/agentMessage/delta',
          params: {
            delta: '原生',
            itemId: 'message-1',
            threadId,
            turnId,
          },
        });
        send({
          method: 'item/agentMessage/delta',
          params: {
            delta: '回复成功',
            itemId: 'message-1',
            threadId,
            turnId,
          },
        });
        send({
          method: 'item/completed',
          params: {
            completedAtMs: Date.now(),
            item: {
              id: 'message-1',
              phase: 'final_answer',
              text: '原生回复成功',
              type: 'agentMessage',
            },
            threadId,
            turnId,
          },
        });
        send({
          method: 'turn/completed',
          params: {
            threadId,
            turn: { id: turnId, items: [], status: 'completed' },
          },
        });
      } else if (
        request.method === 'thread/archive' ||
        request.method === 'thread/resume'
      ) {
        send({
          id: request.id,
          result:
            request.method === 'thread/resume'
              ? { thread: { id: request.params.threadId } }
              : {},
        });
      }
    }
  });
  return { child, requests };
}

test('app-server client creates a persistent native thread and streams its reply', async () => {
  const fake = createFakeCodexProcess();
  const updates = [];
  const client = createCodexAppServerClient({
    codexBin: 'codex',
    runtimeWorkspace: '/tmp/offerloop-runtime',
    sourceRoot: '/workspace/OfferLoop',
    spawnProcess: () => fake.child,
  });

  const execution = await client.runTurn({
    confirmed: false,
    message: '帮我准备面试',
    onUpdate: (update) => updates.push(update),
    route: 'interview-prep',
  });
  const outcome = await execution.completion;

  assert.equal(
    execution.threadId,
    '019fa268-8999-79b1-bef7-d2a43bfc81a6',
  );
  assert.deepEqual(outcome, {
    ok: true,
    result: '原生回复成功',
    turnId: '019fa268-a999-7777-bef7-d2a43bfc81a6',
  });
  assert.equal(updates.at(-1).result, '原生回复成功');
  assert.ok(
    fake.requests.some(
      (request) =>
        request.method === 'thread/start' &&
        request.params.threadSource === 'appServer' &&
        request.params.ephemeral === false,
    ),
  );
  const turnRequest = fake.requests.find(
    (request) => request.method === 'turn/start',
  );
  const threadRequest = fake.requests.find(
    (request) => request.method === 'thread/start',
  );
  assert.equal(turnRequest.params.input[0].text, '帮我准备面试');
  assert.match(threadRequest.params.developerInstructions, /OfferLoop Agent/u);
  client.close();
});

test('new conversation is visible before its first real message', async () => {
  const fake = createFakeCodexProcess();
  const updates = [];
  const client = createCodexAppServerClient({
    codexBin: 'codex',
    runtimeWorkspace: '/tmp/offerloop-runtime',
    sourceRoot: '/workspace/OfferLoop',
    spawnProcess: () => fake.child,
  });

  const bootstrap = await client.createVisibleThread({
    onUpdate: (update) => updates.push(update),
  });
  await bootstrap.completion;
  assert.equal(
    bootstrap.threadId,
    '019fa268-8999-79b1-bef7-d2a43bfc81a6',
  );
  assert.equal(
    fake.requests.filter((request) => request.method === 'thread/start').length,
    1,
  );
  assert.equal(
    fake.requests.filter((request) => request.method === 'turn/start').length,
    1,
  );
  assert.ok(updates.every((update) => update.result === undefined));
  const bootstrapTurn = fake.requests.find(
    (request) => request.method === 'turn/start',
  );
  assert.match(bootstrapTurn.params.input[0].text, /OfferLoop 工作台/u);
  const bootstrapNames = fake.requests.filter(
    (request) => request.method === 'thread/name/set',
  );
  assert.equal(bootstrapNames.at(-1).params.name, 'OfferLoop 新对话');

  const execution = await client.runTurn({
    confirmed: false,
    message: '这是第一条正式消息',
    onUpdate: () => undefined,
    route: 'chat',
    sessionId: bootstrap.threadId,
  });
  await execution.completion;

  assert.equal(
    fake.requests.filter((request) => request.method === 'thread/start').length,
    1,
  );
  assert.equal(
    fake.requests.filter((request) => request.method === 'turn/start').length,
    2,
  );
  const nameRequests = fake.requests.filter(
    (request) => request.method === 'thread/name/set',
  );
  assert.equal(nameRequests.at(-1).params.name, '这是第一条正式消息');
  client.close();
});

test('app-server args preserve the Feishu-only permission profile', () => {
  const args = createAppServerArgs({
    runtimeWorkspace: '/tmp/offerloop-runtime',
  });
  assert.ok(args.includes('default_permissions="offerloop-feishu"'));
  assert.ok(args.some((arg) => arg.includes('**.feishu.cn')));
  assert.equal(normalizeThreadTitle('a'.repeat(60)), `${'a'.repeat(36)}…`);
});
