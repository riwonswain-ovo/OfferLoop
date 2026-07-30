import {
  OFFERLOOP_ORIGIN_URL,
  buildCodexTaskUrl,
  buildOfferLoopPrompt,
} from '../../client/src/lib/codex-task';

describe('Codex task deep links', () => {
  it('opens a new local Codex task with an encoded prompt and workspace origin', () => {
    const prompt = buildOfferLoopPrompt(
      'interview-prep',
      '请为字节跳动的产品经理岗位准备面试。',
    );
    const url = buildCodexTaskUrl(prompt);

    expect(url).toBe(
      'codex://threads/new'
      + `?prompt=${encodeURIComponent(prompt)}`
      + `&originUrl=${encodeURIComponent(OFFERLOOP_ORIGIN_URL)}`,
    );
    expect(decodeURIComponent(url)).toContain(
      '请使用 interview-prep Skill 完成下面的 OfferLoop 任务',
    );
  });

  it('does not execute or submit the prompt from the workbench', () => {
    const url = buildCodexTaskUrl('只填入输入框');

    expect(url.startsWith('codex://threads/new?')).toBe(true);
    expect(url).not.toContain('send=');
    expect(url).not.toContain('submit=');
  });
});
