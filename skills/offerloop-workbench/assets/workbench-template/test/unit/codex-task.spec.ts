import {
  buildCodexTaskUrl,
  buildOfferLoopPrompt,
} from '../../client/src/lib/codex-task';

describe('Codex task deep links', () => {
  it('opens a new local Codex task without requiring repository access', () => {
    const prompt = buildOfferLoopPrompt(
      'interview-prep',
      '请为字节跳动的产品经理岗位准备面试。',
    );
    const url = buildCodexTaskUrl(prompt);

    expect(url).toBe(
      'codex://threads/new'
      + `?prompt=${encodeURIComponent(prompt)}`,
    );
    expect(decodeURIComponent(url)).toContain(
      '请使用 interview-prep Skill 完成下面的 OfferLoop 任务',
    );
    expect(url).not.toContain('originUrl=');
    expect(url).not.toContain('OfferLoop-development');
  });

  it('accepts an explicit origin only when a trusted deployment provides one', () => {
    const originUrl = 'https://github.com/example/offerloop-fork.git';
    const url = buildCodexTaskUrl('检查我的求职进展', originUrl);

    expect(url).toContain(`originUrl=${encodeURIComponent(originUrl)}`);
  });

  it('does not execute or submit the prompt from the workbench', () => {
    const url = buildCodexTaskUrl('只填入输入框');

    expect(url.startsWith('codex://threads/new?')).toBe(true);
    expect(url).not.toContain('send=');
    expect(url).not.toContain('submit=');
  });
});
