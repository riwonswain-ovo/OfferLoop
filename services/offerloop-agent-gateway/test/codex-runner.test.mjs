import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgentPrompt,
  createCodexArgs,
  extractCodexEvent,
} from '../src/codex-runner.mjs';

test('buildAgentPrompt keeps Skill safety instructions', () => {
  const prompt = buildAgentPrompt({
    confirmed: false,
    message: '检查面试通知',
    route: 'recruiting-reminder',
  });

  assert.match(prompt, /SKILL[.]md/u);
  assert.match(prompt, /用户尚未额外确认/u);
  assert.match(prompt, /recruiting-reminder/u);
});

test('createCodexArgs starts or resumes a session', () => {
  const firstRun = createCodexArgs({
    confirmed: false,
    message: '你好',
    route: 'auto',
    workspace: '/tmp/offerloop',
  });
  const resumedRun = createCodexArgs({
    confirmed: true,
    message: '继续',
    route: 'auto',
    sessionId: 'session-id',
    workspace: '/tmp/offerloop',
  });

  assert.deepEqual(firstRun.slice(0, 2), ['exec', '--json']);
  assert.deepEqual(resumedRun.slice(0, 4), [
    'exec',
    'resume',
    '--json',
    'session-id',
  ]);
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
