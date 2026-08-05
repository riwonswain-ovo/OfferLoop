import type { WorkbenchWikiNode } from '@shared/api.interface';

import { collectMaterials } from '../../client/src/pages/workbench/workbench-materials';

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
