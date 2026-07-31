import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const CODEX_BIN =
  process.env.CODEX_BIN ??
  '/Applications/ChatGPT.app/Contents/Resources/codex';
const WORKSPACE =
  process.env.OFFERLOOP_PROBE_WORKSPACE ??
  process.cwd();
const THREAD_NAME = 'OfferLoop 原生会话验证';
const TIMEOUT_MS = 180_000;

const child = spawn(CODEX_BIN, ['app-server', '--listen', 'stdio://'], {
  cwd: WORKSPACE,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const lines = createInterface({ input: child.stdout });
let stderr = '';
let threadId = '';
let finalMessage = '';
let settled = false;

const send = (message) => {
  child.stdin.write(`${JSON.stringify(message)}\n`);
};

const finish = (result, exitCode = 0) => {
  if (settled) {
    return;
  }
  settled = true;
  clearTimeout(timeout);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  child.kill('SIGTERM');
  process.exitCode = exitCode;
};

const timeout = setTimeout(() => {
  finish(
    {
      error: 'Timed out waiting for the native Codex thread turn',
      stderr: stderr.trim(),
      threadId,
    },
    1,
  );
}, TIMEOUT_MS);

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-8_000);
});

lines.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.id === 1 && message.result) {
    send({ method: 'initialized', params: {} });
    send({
      id: 2,
      method: 'thread/start',
      params: {
        approvalPolicy: 'never',
        cwd: WORKSPACE,
        ephemeral: false,
        sandbox: 'read-only',
        threadSource: 'appServer',
      },
    });
    return;
  }

  if (message.id === 2 && message.result?.thread?.id) {
    threadId = message.result.thread.id;
    send({
      id: 3,
      method: 'thread/name/set',
      params: {
        name: THREAD_NAME,
        threadId,
      },
    });
    send({
      id: 4,
      method: 'turn/start',
      params: {
        approvalPolicy: 'never',
        input: [
          {
            type: 'text',
            text:
              '这是 OfferLoop 原生会话侧边栏验证。' +
              '不要读取或修改任何文件，不要调用工具；只回复“原生会话验证成功”。',
          },
        ],
        threadId,
      },
    });
    return;
  }

  const item = message.params?.item;
  if (
    message.method === 'item/completed' &&
    item?.type === 'agentMessage' &&
    typeof item.text === 'string'
  ) {
    finalMessage = item.text;
  }

  if (message.method === 'turn/completed' && threadId) {
    finish({
      finalMessage,
      name: THREAD_NAME,
      ok: true,
      threadId,
    });
  }
});

child.on('error', (error) => {
  finish({ error: error.message, threadId }, 1);
});

child.on('close', (code) => {
  if (!settled && code !== 0) {
    finish(
      {
        error: `app-server exited with code ${String(code)}`,
        stderr: stderr.trim(),
        threadId,
      },
      1,
    );
  }
});

send({
  id: 1,
  method: 'initialize',
  params: {
    capabilities: {
      experimentalApi: true,
    },
    clientInfo: {
      name: 'offerloop_sidebar_probe',
      title: 'OfferLoop Sidebar Probe',
      version: '0.1.0',
    },
  },
});
