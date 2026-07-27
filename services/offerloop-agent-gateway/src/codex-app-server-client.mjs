import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import {
  buildAgentInstructions,
  FEISHU_NETWORK_POLICY,
  OFFERLOOP_PERMISSION_PROFILE,
} from './codex-runner.mjs';

const REQUEST_TIMEOUT_MS = 30_000;
const TURN_TIMEOUT_MS = 30 * 60_000;

function createAppServerArgs({ runtimeWorkspace }) {
  return [
    'app-server',
    '--listen',
    'stdio://',
    '-c',
    `default_permissions="${OFFERLOOP_PERMISSION_PROFILE}"`,
    '-c',
    `permissions.${OFFERLOOP_PERMISSION_PROFILE}.filesystem={ ":root" = "read", ${JSON.stringify(runtimeWorkspace)} = "write" }`,
    '-c',
    `permissions.${OFFERLOOP_PERMISSION_PROFILE}.network.enabled=true`,
    '-c',
    `permissions.${OFFERLOOP_PERMISSION_PROFILE}.network.domains=${FEISHU_NETWORK_POLICY}`,
    '-c',
    'features.network_proxy.enabled=true',
    '-c',
    `features.network_proxy.domains=${FEISHU_NETWORK_POLICY}`,
  ];
}

function normalizeThreadTitle(message) {
  const title = message.replace(/\s+/gu, ' ').trim();
  return title.length > 36 ? `${title.slice(0, 36)}…` : title;
}

class CodexAppServerClient {
  constructor({
    codexBin,
    runtimeWorkspace,
    sourceRoot,
    spawnProcess = spawn,
  }) {
    this.codexBin = codexBin;
    this.runtimeWorkspace = runtimeWorkspace;
    this.sourceRoot = sourceRoot;
    this.spawnProcess = spawnProcess;
    this.child = null;
    this.initializing = null;
    this.nextRequestId = 1;
    this.pendingRequests = new Map();
    this.resumedThreads = new Set();
    this.activeTurn = null;
    this.stderr = '';
  }

  async start() {
    if (this.child && !this.child.killed) {
      return;
    }
    if (this.initializing) {
      return this.initializing;
    }
    this.initializing = this.initialize();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  async initialize() {
    const child = this.spawnProcess(
      this.codexBin,
      createAppServerArgs({ runtimeWorkspace: this.runtimeWorkspace }),
      {
        cwd: this.sourceRoot,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    this.child = child;
    this.stderr = '';
    this.resumedThreads.clear();

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-8_000);
    });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => this.handleLine(line));
    child.on('error', (error) => this.handleExit(error));
    child.on('close', (code) => {
      if (this.child === child) {
        const suffix = this.stderr.trim();
        this.handleExit(
          new Error(
            `Codex app-server exited with code ${String(code)}${
              suffix ? `: ${suffix}` : ''
            }`,
          ),
        );
      }
    });

    await this.request('initialize', {
      capabilities: { experimentalApi: true },
      clientInfo: {
        name: 'offerloop_workbench',
        title: 'OfferLoop Workbench',
        version: '0.7.0',
      },
    });
    this.notify('initialized', {});
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        return;
      }
      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(
          new Error(
            message.error.message ??
              message.error.data?.message ??
              'Codex app-server request failed',
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    this.handleNotification(message);
  }

  handleNotification(message) {
    const active = this.activeTurn;
    if (!active || message.params?.threadId !== active.threadId) {
      return;
    }
    const turnId = message.params?.turnId ?? message.params?.turn?.id;
    if (active.turnId && turnId && turnId !== active.turnId) {
      return;
    }
    if (turnId && !active.turnId) {
      active.turnId = turnId;
    }

    if (message.method === 'turn/started') {
      active.onUpdate({ progress: '正在理解需求' });
      return;
    }
    if (message.method === 'item/started') {
      active.onUpdate({ progress: '正在执行任务' });
      return;
    }
    if (message.method === 'item/agentMessage/delta') {
      const itemId = message.params?.itemId;
      if (itemId && itemId !== active.currentMessageItemId) {
        active.currentMessageItemId = itemId;
        active.currentMessage = '';
      }
      active.currentMessage += message.params?.delta ?? '';
      if (active.currentMessage) {
        active.latestResult = active.currentMessage;
        active.onUpdate({
          progress: '正在生成回复',
          result: active.latestResult,
        });
      }
      return;
    }
    if (message.method === 'item/completed') {
      const item = message.params?.item;
      if (
        item?.type === 'agentMessage' &&
        typeof item.text === 'string' &&
        item.phase !== 'commentary'
      ) {
        active.latestResult = item.text;
        active.onUpdate({
          progress: '正在整理结果',
          result: item.text,
        });
      }
      return;
    }
    if (message.method === 'turn/completed') {
      const status = message.params?.turn?.status;
      if (status === 'completed') {
        active.resolve({
          ok: true,
          result: active.latestResult,
          turnId: active.turnId,
        });
      } else if (status === 'interrupted') {
        active.resolve({
          interrupted: true,
          ok: false,
          turnId: active.turnId,
        });
      } else {
        active.resolve({
          error:
            message.params?.turn?.error?.message ??
            `Codex turn ended with status ${String(status)}`,
          ok: false,
          turnId: active.turnId,
        });
      }
      this.finishActiveTurn();
    }
  }

  handleExit(error) {
    if (!this.child) {
      return;
    }
    this.child = null;
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
    if (this.activeTurn) {
      this.activeTurn.resolve({ error: error.message, ok: false });
      this.finishActiveTurn();
    }
  }

  request(method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!this.child?.stdin?.writable) {
      return Promise.reject(new Error('Codex app-server is not running'));
    }
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Codex app-server ${method} timed out`));
      }, timeoutMs);
      timeout.unref?.();
      this.pendingRequests.set(id, { reject, resolve, timeout });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  notify(method, params) {
    if (!this.child?.stdin?.writable) {
      throw new Error('Codex app-server is not running');
    }
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async ensureThread(sessionId, title, developerInstructions) {
    await this.start();
    if (sessionId) {
      if (developerInstructions || !this.resumedThreads.has(sessionId)) {
        await this.request('thread/resume', {
          approvalPolicy: 'never',
          cwd: this.sourceRoot,
          developerInstructions,
          permissions: OFFERLOOP_PERMISSION_PROFILE,
          threadId: sessionId,
        });
        this.resumedThreads.add(sessionId);
      }
      return sessionId;
    }
    const response = await this.request('thread/start', {
      approvalPolicy: 'never',
      cwd: this.sourceRoot,
      developerInstructions,
      ephemeral: false,
      permissions: OFFERLOOP_PERMISSION_PROFILE,
      threadSource: 'appServer',
    });
    const threadId = response?.thread?.id;
    if (!threadId) {
      throw new Error('Codex app-server did not return a thread id');
    }
    this.resumedThreads.add(threadId);
    if (title) {
      await this.request('thread/name/set', {
        name: normalizeThreadTitle(title),
        threadId,
      }).catch(() => undefined);
    }
    return threadId;
  }

  async runTurn({
    confirmed,
    message,
    onUpdate,
    route,
    sessionId,
  }) {
    if (this.activeTurn) {
      throw new Error('Codex app-server already has an active turn');
    }
    const developerInstructions = buildAgentInstructions({
      confirmed,
      route,
      sourceRoot: this.sourceRoot,
    });
    const threadId = await this.ensureThread(
      sessionId,
      message,
      developerInstructions,
    );
    onUpdate({ sessionId: threadId });
    const completion = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.activeTurn?.threadId === threadId) {
          resolve({ error: 'Codex turn timed out', ok: false });
          this.finishActiveTurn();
        }
      }, TURN_TIMEOUT_MS);
      timeout.unref?.();
      this.activeTurn = {
        currentMessage: '',
        currentMessageItemId: '',
        latestResult: '',
        onUpdate,
        resolve,
        threadId,
        timeout,
        turnId: '',
      };
    });
    try {
      const response = await this.request('turn/start', {
        approvalPolicy: 'never',
        input: [{ text: message, type: 'text' }],
        permissions: OFFERLOOP_PERMISSION_PROFILE,
        threadId,
      });
      if (this.activeTurn?.threadId === threadId) {
        this.activeTurn.turnId = response?.turn?.id ?? this.activeTurn.turnId;
      }
    } catch (error) {
      if (this.activeTurn?.threadId === threadId) {
        this.activeTurn.resolve({ error: error.message, ok: false });
        this.finishActiveTurn();
      }
    }
    return { completion, threadId };
  }

  async interrupt() {
    const active = this.activeTurn;
    if (!active?.turnId) {
      return false;
    }
    try {
      await this.request('turn/interrupt', {
        threadId: active.threadId,
        turnId: active.turnId,
      });
      return true;
    } catch (error) {
      if (/no active turn/iu.test(error.message)) {
        return true;
      }
      throw error;
    }
  }

  async archive(sessionId) {
    await this.ensureThread(sessionId);
    await this.request('thread/archive', { threadId: sessionId });
  }

  finishActiveTurn() {
    if (this.activeTurn) {
      clearTimeout(this.activeTurn.timeout);
      this.activeTurn = null;
    }
  }

  close() {
    const child = this.child;
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
    if (this.child === child) {
      this.handleExit(new Error('Codex app-server was stopped'));
    }
  }
}

function createCodexAppServerClient(options) {
  return new CodexAppServerClient(options);
}

export {
  CodexAppServerClient,
  createAppServerArgs,
  createCodexAppServerClient,
  normalizeThreadTitle,
};
