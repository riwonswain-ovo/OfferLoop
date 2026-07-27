import { spawn } from 'node:child_process';

const DETACHED_PROCESS = process.platform !== 'win32';
const PROGRESS_BY_EVENT = new Map([
  ['thread.started', '已创建 OfferLoop 会话'],
  ['turn.started', '正在理解需求并选择 Skill'],
  ['item.started', '正在执行 Skill 步骤'],
  ['item.completed', '已完成一个 Skill 步骤'],
  ['turn.completed', '正在整理结果'],
]);

function buildAgentPrompt({ confirmed, message, route }) {
  const confirmationState = confirmed
    ? '用户已在飞书界面确认本轮中已展示的敏感操作。'
    : '用户尚未额外确认敏感操作。';
  const routeHint =
    route && route !== 'auto'
      ? `界面初步识别的 Skill 是 ${route}，但仍须以实际 SKILL.md 触发规则为准。`
      : '请根据用户需求自动选择最合适的 OfferLoop Skill。';

  return [
    '你是通过飞书工作台提供服务的 OfferLoop Agent。',
    '本轮是求职业务助手任务，不是代码开发任务。',
    '必须读取并严格遵循匹配的 OfferLoop SKILL.md；需要时使用该 Skill 指定的工具和脚本。',
    '不要修改 OfferLoop 源代码，不要创建分支或提交代码。',
    '不要要求用户在聊天中提供密码、Cookie、App Secret、token 或邮箱授权码。',
    '如果 SKILL.md 要求确认，而当前确认不足，请停止在确认点并清楚说明影响范围。',
    confirmationState,
    routeHint,
    '最终使用简洁、自然的中文回复，并明确说明实际调用了哪个 Skill。',
    '',
    `用户消息：${message}`,
  ].join('\n');
}

function extractCodexEvent(event) {
  const update = {};
  if (typeof event?.thread_id === 'string') {
    update.sessionId = event.thread_id;
  }
  if (typeof event?.threadId === 'string') {
    update.sessionId = event.threadId;
  }

  const eventType = typeof event?.type === 'string' ? event.type : '';
  const progress = PROGRESS_BY_EVENT.get(eventType);
  if (progress) {
    update.progress = progress;
  }

  const item = event?.item;
  if (
    eventType === 'item.completed' &&
    item?.type === 'agent_message' &&
    typeof item?.text === 'string'
  ) {
    update.result = item.text;
  }

  if (eventType === 'turn.failed') {
    const errorMessage =
      typeof event?.error?.message === 'string'
        ? event.error.message
        : 'Codex turn failed';
    update.error = errorMessage;
  }
  return update;
}

function createCodexArgs({ confirmed, message, route, sessionId, workspace }) {
  const prompt = buildAgentPrompt({ confirmed, message, route });
  if (sessionId) {
    return ['exec', 'resume', '--json', sessionId, prompt];
  }
  return [
    'exec',
    '--json',
    '--color',
    'never',
    '--sandbox',
    'workspace-write',
    '-C',
    workspace,
    prompt,
  ];
}

function createCodexArchiveArgs(sessionId) {
  return ['archive', sessionId];
}

function signalCodexProcess(child, signal) {
  if (!child || typeof child.pid !== 'number') {
    return false;
  }
  try {
    if (DETACHED_PROCESS) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
    return true;
  } catch {
    try {
      child.kill(signal);
      return true;
    } catch {
      return false;
    }
  }
}

function startCodexArchive({ codexBin, onUpdate, sessionId, workspace }) {
  const child = spawn(codexBin, createCodexArchiveArgs(sessionId), {
    cwd: workspace,
    detached: DETACHED_PROCESS,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  onUpdate({ progress: '正在归档 Codex 对话' });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-6_000);
  });
  const completion = new Promise((resolve) => {
    child.on('error', (error) => {
      resolve({ error: error.message, ok: false });
    });
    child.on('close', (code) => {
      resolve({
        error:
          code === 0
            ? undefined
            : stderr.trim() || `Codex exited with code ${String(code)}`,
        ok: code === 0,
      });
    });
  });
  return { child, completion };
}

function startCodexRun({
  codexBin,
  confirmed,
  message,
  onUpdate,
  route,
  sessionId,
  workspace,
}) {
  const args = createCodexArgs({
    confirmed,
    message,
    route,
    sessionId,
    workspace,
  });
  const child = spawn(codexBin, args, {
    cwd: workspace,
    detached: DETACHED_PROCESS,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        onUpdate(extractCodexEvent(JSON.parse(line)));
      } catch {
        onUpdate({ progress: '正在处理 Agent 返回内容' });
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-6_000);
  });

  const completion = new Promise((resolve) => {
    child.on('error', (error) => {
      resolve({
        ok: false,
        error: error.message,
      });
    });
    child.on('close', (code) => {
      if (stdoutBuffer.trim()) {
        try {
          onUpdate(extractCodexEvent(JSON.parse(stdoutBuffer)));
        } catch {
          // A partial JSONL line cannot be used safely.
        }
      }
      resolve({
        ok: code === 0,
        error:
          code === 0
            ? undefined
            : stderr.trim() || `Codex exited with code ${String(code)}`,
      });
    });
  });

  return { child, completion };
}

export {
  buildAgentPrompt,
  createCodexArchiveArgs,
  createCodexArgs,
  extractCodexEvent,
  signalCodexProcess,
  startCodexArchive,
  startCodexRun,
};
