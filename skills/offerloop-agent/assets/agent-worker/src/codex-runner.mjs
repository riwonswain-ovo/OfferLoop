import { spawn } from 'node:child_process';

const DETACHED_PROCESS = process.platform !== 'win32';
const OFFERLOOP_PERMISSION_PROFILE = 'offerloop-feishu';
const FEISHU_NETWORK_POLICY =
  '{ "**.feishu.cn" = "allow", "**.feishucdn.com" = "allow", "**.larksuite.com" = "allow" }';
const PROGRESS_BY_EVENT = new Map([
  ['thread.started', '已创建 OfferLoop 会话'],
  ['turn.started', '正在理解需求并选择 Skill'],
  ['item.started', '正在执行 Skill 步骤'],
  ['item.completed', '已完成一个 Skill 步骤'],
  ['turn.completed', '正在整理结果'],
]);

function buildAgentInstructions({ confirmed, route, sourceRoot }) {
  const confirmationState = confirmed
    ? '用户已在飞书界面确认本轮中已展示的敏感操作。'
    : '用户尚未额外确认敏感操作。';
  let routeHint =
    '先判断本轮是否真的需要 Skill。只有明确的求职业务任务才选择并读取最合适的 OfferLoop Skill。';
  if (route === 'chat') {
    routeHint =
      '本轮是普通求职对话。不要读取 Skill、不要调用工具，直接自然回答用户。';
  } else if (route === 'continue') {
    routeHint =
      '本轮是上一任务的省略式续聊。结合当前 Codex 任务上下文继续；若用户明确提出新任务，必须重新选择匹配的 Skill。';
  } else if (route && route !== 'auto') {
    routeHint = `界面初步识别的 Skill 是 ${route}，但仍须以实际 SKILL.md 触发规则为准。`;
  }
  const skillRequired =
    route === 'chat'
      ? '本轮禁止为了展示流程而调用 Skill。'
      : '若本轮需要 Skill，必须读取并严格遵循匹配的 OfferLoop SKILL.md；不需要 Skill 时直接回答。';

  return [
    '你是通过飞书工作台提供服务的 OfferLoop Agent。',
    '本轮是求职业务助手任务，不是代码开发任务。',
    skillRequired,
    `本机 OfferLoop 只读根目录是 ${sourceRoot}。`,
    '本机业务文件、OfferLoop 源代码和 Skills 均为只读；禁止修改、创建、移动或删除这些文件。',
    '运行目录仅用于必要的临时缓存，不得把业务结果保存在本机。',
    '业务内容只能写入用户已授权的飞书知识库、飞书文档、飞书 Base 或飞书日历。',
    '写入或删除飞书内容前，必须遵循对应 Skill 的确认规则和用户授权范围。',
    '报告飞书连接或权限失败前，必须实际执行对应 Skill 指定的只读状态检查，并以本轮命令结果为准；不得复用旧报错或凭历史记录推断。',
    '若检查失败，须区分网络、登录授权和权限范围问题，并用不含凭证的原始错误摘要说明原因。',
    '不要创建分支或提交代码。',
    '不要要求用户在聊天中提供密码、Cookie、App Secret、token 或邮箱授权码。',
    '如果 SKILL.md 要求确认，而当前确认不足，请停止在确认点并清楚说明影响范围。',
    confirmationState,
    routeHint,
    '最终使用简洁、自然的中文回复。仅在实际调用 Skill 时说明 Skill 名称；普通对话不要声称调用了 Skill。',
  ].join('\n');
}

function buildAgentPrompt({ confirmed, message, route, sourceRoot }) {
  return [
    buildAgentInstructions({ confirmed, route, sourceRoot }),
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

function createCodexArgs({
  confirmed,
  message,
  route,
  sessionId,
  sourceRoot,
  workspace,
}) {
  const prompt = buildAgentPrompt({
    confirmed,
    message,
    route,
    sourceRoot: sourceRoot ?? workspace,
  });
  const args = [
    'exec',
    '--json',
    '--color',
    'never',
    '--skip-git-repo-check',
    '-c',
    `default_permissions="${OFFERLOOP_PERMISSION_PROFILE}"`,
    '-c',
    `permissions.${OFFERLOOP_PERMISSION_PROFILE}.filesystem={ ":root" = "read", ${JSON.stringify(workspace)} = "write" }`,
    '-c',
    `permissions.${OFFERLOOP_PERMISSION_PROFILE}.network.enabled=true`,
    '-c',
    `permissions.${OFFERLOOP_PERMISSION_PROFILE}.network.domains=${FEISHU_NETWORK_POLICY}`,
    '-c',
    'features.network_proxy.enabled=true',
    '-c',
    `features.network_proxy.domains=${FEISHU_NETWORK_POLICY}`,
    '-C',
    workspace,
  ];
  if (sessionId) {
    args.push('resume', sessionId, prompt);
  } else {
    args.push(prompt);
  }
  return args;
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
  sourceRoot,
  workspace,
}) {
  const args = createCodexArgs({
    confirmed,
    message,
    route,
    sessionId,
    sourceRoot,
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
  FEISHU_NETWORK_POLICY,
  OFFERLOOP_PERMISSION_PROFILE,
  buildAgentInstructions,
  buildAgentPrompt,
  createCodexArchiveArgs,
  createCodexArgs,
  extractCodexEvent,
  signalCodexProcess,
  startCodexArchive,
  startCodexRun,
};
