import { spawnSync } from 'node:child_process';

const APP_ID = 'app_17abq8v4k7k';
const KEYCHAIN_SERVICE = 'OfferLoop Agent Worker';
const KEYCHAIN_ACCOUNT = APP_ID;
const SCOPES = [
  'POST /openapi/agent-worker/poll',
  'POST /openapi/agent-worker/run-update',
];

function hasStoredKey() {
  if (process.platform !== 'darwin') {
    return false;
  }
  const result = spawnSync(
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
  return result.status === 0 && Boolean(result.stdout.trim());
}

function createApiKey() {
  const args = [
    'apps',
    '+openapi-key-create',
    '--as',
    'user',
    '--app-id',
    APP_ID,
    '--name',
    'OfferLoop 本机 Agent',
  ];
  for (const scope of SCOPES) {
    args.push('--scope-api', scope);
  }
  const result = spawnSync('lark-cli', args, {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Unable to create API key');
  }
  const envelope = JSON.parse(result.stdout);
  const apiKey = envelope?.data?.api_key;
  if (typeof apiKey !== 'string' || !apiKey) {
    throw new Error('Miaoda did not return the one-time API key');
  }
  return apiKey;
}

function storeApiKey(apiKey) {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Set OFFERLOOP_WORKBENCH_API_KEY in the worker environment',
    );
  }
  const result = spawnSync(
    '/usr/bin/security',
    [
      'add-generic-password',
      '-U',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      KEYCHAIN_ACCOUNT,
      '-w',
      apiKey,
    ],
    {
      encoding: 'utf8',
      timeout: 5_000,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Unable to store API key');
  }
}

if (hasStoredKey()) {
  process.stdout.write('OfferLoop Agent API key is already in Keychain.\n');
} else {
  const apiKey = createApiKey();
  storeApiKey(apiKey);
  process.stdout.write(
    'OfferLoop Agent API key was created and stored in Keychain.\n',
  );
}
