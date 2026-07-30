import type { WorkbenchWikiNode } from '@shared/api.interface';

import {
  collectMaterials,
} from '../../client/src/pages/workbench/workbench-materials';

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
  it('keeps leaf documents and excludes documents used as folders', () => {
    const resume = createNode('示例用户｜产品经理简历', 'resume');
    const resumeFolder = createNode('01｜当前简历', 'resume-folder', [
      resume,
    ]);
    const review = createNode('卡尔动力一面复盘', 'review');
    const reviewFolder = createNode('04｜面试复盘', 'review-folder', [
      review,
    ]);
    const emptyResumeFolder = createNode(
      '01｜当前简历',
      'empty-resume-folder',
    );
    const pendingReviewFolder = createNode('ASR待复盘', 'pending-review');
    const mockInterviewFolder = createNode(
      '06｜模拟面试',
      'mock-interview-folder',
    );
    const questionBankFolder = createNode(
      '待学习题库',
      'question-bank-folder',
    );

    expect(
      collectMaterials([
        resumeFolder,
        reviewFolder,
        emptyResumeFolder,
        pendingReviewFolder,
        mockInterviewFolder,
        questionBankFolder,
      ]).map(
        (material) => material.name,
      ),
    ).toEqual([
      '示例用户｜产品经理简历',
      '卡尔动力一面复盘',
    ]);
  });
});
