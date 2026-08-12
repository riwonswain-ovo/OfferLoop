import type { WorkbenchWikiNode } from '@shared/api.interface';

import { collectMaterials } from '../../client/src/pages/workbench/workbench-materials';
import { isEmbeddableWikiNode } from '../../client/src/pages/workbench/workbench-wiki-nodes';

const createNode = (
  title: string,
  nodeToken: string,
  children: WorkbenchWikiNode[] = [],
): WorkbenchWikiNode => ({
  nodeToken,
  objectToken: `${nodeToken}-document`,
  objectType: 'docx',
  title,
  hasChildren: children.length > 0,
  wikiUrl: `https://my.feishu.cn/wiki/${nodeToken}`,
  documentUrl: `https://my.feishu.cn/docx/${nodeToken}-document`,
  children,
});

describe('WorkbenchMaterialsPage material collection', () => {
  it('embeds docx, sheet, and bitable wiki nodes when they have direct urls', () => {
    const docx = createNode('飞书文档', 'docx-node');
    const sheet: WorkbenchWikiNode = {
      ...createNode('电子表格', 'sheet-node'),
      objectType: 'sheet',
      documentUrl: 'https://my.feishu.cn/sheets/sheet-document',
    };
    const bitable: WorkbenchWikiNode = {
      ...createNode('多维表格', 'base-node'),
      objectType: 'bitable',
      documentUrl: 'https://my.feishu.cn/wiki/base-node',
    };
    const unsupported: WorkbenchWikiNode = {
      ...createNode('未知内容', 'unknown-node'),
      objectType: 'file',
    };
    const missingUrl: WorkbenchWikiNode = {
      ...createNode('缺少地址', 'missing-url-node'),
      objectType: 'bitable',
      documentUrl: undefined,
    };

    expect([docx, sheet, bitable].every(isEmbeddableWikiNode)).toBe(true);
    expect(isEmbeddableWikiNode(unsupported)).toBe(false);
    expect(isEmbeddableWikiNode(missingUrl)).toBe(false);
  });

  it('keeps leaf documents and excludes current and legacy folder nodes', () => {
    const resume = createNode('示例用户｜产品经理简历', 'resume');
    const resumeFolder = createNode('02 | 简历合集', 'resume-folder', [resume]);
    const deepDive = createNode('经历深挖｜推荐系统｜产品经理', 'deep-dive');
    const deepDiveFolder = createNode('03｜经历深挖', 'deep-dive-folder', [
      deepDive,
    ]);
    const review = createNode('卡尔动力一面复盘', 'review');
    const reviewFolder = createNode('05｜面试复盘', 'review-folder', [review]);
    const emptyResumeFolder = createNode('01｜当前简历', 'empty-resume-folder');
    const pendingReviewFolder = createNode('ASR待复盘', 'pending-review');
    const mockInterviewFolder = createNode(
      '06｜模拟面试',
      'mock-interview-folder',
    );
    const questionBankFolder = createNode('待学习题库', 'question-bank-folder');
    const productSenseFolder = createNode(
      '05 | 产品 Sense',
      'product-sense-folder',
    );

    expect(
      collectMaterials([
        resumeFolder,
        deepDiveFolder,
        reviewFolder,
        emptyResumeFolder,
        pendingReviewFolder,
        mockInterviewFolder,
        questionBankFolder,
        productSenseFolder,
      ]).map((material) => [material.name, material.type]),
    ).toEqual([
      ['示例用户｜产品经理简历', '简历合集'],
      ['经历深挖｜推荐系统｜产品经理', '经历深挖'],
      ['卡尔动力一面复盘', '面试复盘'],
    ]);
  });
});
