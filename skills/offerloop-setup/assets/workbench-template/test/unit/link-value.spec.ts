import { extractLinkTargets } from '../../client/src/pages/workbench/link-value';

describe('extractLinkTargets', () => {
  it('returns only valid URLs from Base link values', () => {
    expect(extractLinkTargets('公告中邮箱投递')).toEqual([]);
    expect(extractLinkTargets('https://example.com/apply')).toEqual([
      'https://example.com/apply',
    ]);
    expect(
      extractLinkTargets({ text: '投递入口', link: 'https://example.com/job' }),
    ).toEqual(['https://example.com/job']);
    expect(
      extractLinkTargets('[立即投递](https://example.com/markdown)'),
    ).toEqual(['https://example.com/markdown']);
    expect(
      extractLinkTargets([
        { text: '岗位一', url: 'https://example.com/one' },
        '扫码投递',
        'https://example.com/two',
      ]),
    ).toEqual(['https://example.com/one', 'https://example.com/two']);
  });
});
