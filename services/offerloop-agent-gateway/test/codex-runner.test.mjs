import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgentPrompt,
  createCodexArchiveArgs,
  createCodexArgs,
  extractCodexEvent,
} from '../src/codex-runner.mjs';

test('buildAgentPrompt keeps Skill safety instructions', () => {
  const prompt = buildAgentPrompt({
    confirmed: false,
    message: '检查面试通知',
    route: 'recruiting-reminder',
    sourceRoot: '/Users/example/OfferLoop',
  });

  assert.match(prompt, /SKILL[.]md/u);
  assert.match(prompt, /用户尚未额外确认/u);
  assert.match(prompt, /recruiting-reminder/u);
  assert.match(prompt, /本机业务文件.*只读/u);
  assert.match(prompt, /业务内容只能写入.*飞书/u);
  assert.match(prompt, /必须实际执行.*只读状态检查/u);
  assert.match(prompt, /区分网络、登录授权和权限范围/u);
});

test('createCodexArchiveArgs archives the same Codex session', () => {
  assert.deepEqual(createCodexArchiveArgs('thread-1'), [
    'archive',
    'thread-1',
  ]);
});

test('createCodexArgs starts or resumes a session', () => {
  const firstRun = createCodexArgs({
    confirmed: false,
    message: '你好',
    route: 'auto',
    sourceRoot: '/Users/example/OfferLoop',
    workspace: '/tmp/offerloop-runtime',
  });
  const resumedRun = createCodexArgs({
    confirmed: true,
    message: '继续',
    route: 'auto',
    sessionId: 'session-id',
    sourceRoot: '/Users/example/OfferLoop',
    workspace: '/tmp/offerloop-runtime',
  });

  assert.deepEqual(firstRun.slice(0, 2), ['exec', '--json']);
  assert.equal(
    firstRun.includes('default_permissions="offerloop-feishu"'),
    true,
  );
  assert.equal(
    firstRun.some((argument) =>
      argument.startsWith('permissions.offerloop-feishu.filesystem='),
    ),
    true,
  );
  assert.equal(
    firstRun.includes('permissions.offerloop-feishu.network.enabled=true'),
    true,
  );
  assert.equal(firstRun.includes('features.network_proxy.enabled=true'), true);
  assert.equal(
    firstRun.some((argument) => argument.includes('**.feishu.cn')),
    true,
  );
  assert.equal(firstRun.includes('/tmp/offerloop-runtime'), true);
  assert.equal(firstRun.includes('/Users/example/OfferLoop'), false);
  assert.equal(resumedRun.includes('resume'), true);
  assert.equal(resumedRun.includes('session-id'), true);
  assert.equal(
    resumedRun.includes('default_permissions="offerloop-feishu"'),
    true,
  );
});

test('extractCodexEvent reads thread and final assistant message', () => {
  assert.deepEqual(
    extractCodexEvent({
      type: 'thread.started',
      thread_id: 'thread-1',
    }),
    {
      progress: '已创建 OfferLoop 会话',
      sessionId: 'thread-1',
    },
  );
  assert.deepEqual(
    extractCodexEvent({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: '任务完成',
      },
    }),
    {
      progress: '已完成一个 Skill 步骤',
      result: '任务完成',
    },
  );
});
