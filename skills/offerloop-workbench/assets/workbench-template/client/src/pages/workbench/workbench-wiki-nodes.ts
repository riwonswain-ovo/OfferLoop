import type { WorkbenchWikiNode } from '@shared/api.interface';

const EMBEDDABLE_WIKI_OBJECT_TYPES: ReadonlySet<string> = new Set([
  'docx',
  'sheet',
  'bitable',
]);

const normalizeWikiTitle = (title: string): string =>
  title.trim().replace(/\|/gu, '｜').replace(/\s+/gu, '');

const STRUCTURAL_WIKI_TITLES: ReadonlySet<string> = new Set(
  [
    // Current directory contract.
    '01｜核心求职数据',
    '02｜简历合集',
    '03｜经历深挖',
    '04｜面试准备',
    '05｜面试复盘',
    '06｜产品Sense',
    '07｜模拟面试',
    'ASR待复盘',
    '已完成复盘',

    // Older OfferLoop layouts remain readable after an upgrade.
    '01｜简历合集',
    '01｜当前简历',
    '02｜当前简历',
    '02｜经历深挖',
    '02｜简历深挖',
    '03｜简历深挖',
    '03｜面试准备文档',
    '04｜面试复盘',
    '05｜产品Sense',
    '06｜模拟面试',
    '07｜题库',
    '待学习题库',
    '已学会题库',
  ].map(normalizeWikiTitle),
);

export const isStructuralWikiTitle = (title: string): boolean =>
  STRUCTURAL_WIKI_TITLES.has(normalizeWikiTitle(title));

export const isWikiFolderNode = (node: WorkbenchWikiNode): boolean =>
  node.hasChildren ||
  node.children.length > 0 ||
  isStructuralWikiTitle(node.title);

export const isEmbeddableWikiNode = (node: WorkbenchWikiNode): boolean =>
  Boolean(node.documentUrl) &&
  EMBEDDABLE_WIKI_OBJECT_TYPES.has(node.objectType);

export const isBitableWikiNode = (node: WorkbenchWikiNode): boolean =>
  node.objectType === 'bitable';

export const isRecoverableBitableComponentError = (
  node: WorkbenchWikiNode,
  error: unknown,
): boolean => {
  if (!isBitableWikiNode(node) || typeof error !== 'object' || error === null) {
    return false;
  }
  return String((error as Record<string, unknown>).code ?? '') === '-500';
};
