import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHeaders,
  createWorkerClient,
  normalizeBaseUrl,
} from '../src/worker-client.mjs';

test('normalizes the workbench base URL', () => {
  assert.equal(
    normalizeBaseUrl('https://example.test/app/app_123///'),
    'https://example.test/app/app_123',
  );
});

test('sends the API key without exposing it in the URL', async () => {
  const calls = [];
  const client = createWorkerClient({
    apiKey: 'secret-key',
    baseUrl: 'https://example.test/app/app_123/',
    fetchImpl: async (url, init) => {
      calls.push({ init, url });
      return new Response(JSON.stringify({ connected: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    },
  });

  await client.poll({
    codexAvailable: true,
    displayName: 'OfferLoop Mac',
    workerId: 'offerloop-mac',
  });

  assert.equal(
    calls[0].url,
    'https://example.test/app/app_123/openapi/agent-worker/poll',
  );
  assert.equal(calls[0].init.headers['X-Api-Key'], 'secret-key');
  assert.equal(calls[0].url.includes('secret-key'), false);
});

test('builds compatible API key headers', () => {
  assert.deepEqual(createHeaders('secret-key'), {
    Authorization: 'Bearer secret-key',
    'Content-Type': 'application/json',
    'X-Api-Key': 'secret-key',
  });
});

test('uses a fixed result endpoint that API key scopes can authorize', async () => {
  const calls = [];
  const client = createWorkerClient({
    apiKey: 'secret-key',
    baseUrl: 'https://example.test/app/app_123',
    fetchImpl: async (url, init) => {
      calls.push({ init, url });
      return new Response(JSON.stringify({ accepted: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    },
  });

  await client.updateRun('run-123', {
    progress: '正在执行',
    status: 'running',
    workerId: 'offerloop-mac',
  });

  assert.equal(
    calls[0].url,
    'https://example.test/app/app_123/openapi/agent-worker/run-update',
  );
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    progress: '正在执行',
    runId: 'run-123',
    status: 'running',
    workerId: 'offerloop-mac',
  });
});
