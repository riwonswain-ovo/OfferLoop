import type { WorkbenchWikiNode } from '@shared/api.interface';

export type MaterialType =
  | '当前简历'
  | '经历深挖'
  | '面试准备'
  | '面试复盘'
  | '训练文档';

export interface MaterialItem {
  id: string;
  name: string;
  type: MaterialType;
  node: WorkbenchWikiNode;
}

const STRUCTURAL_MATERIAL_TITLES: Set<string> = new Set([
  '01｜当前简历',
  '02｜简历深挖',
  '03｜面试准备文档',
  '04｜面试复盘',
  'ASR待复盘',
  '已完成复盘',
  '06｜模拟面试',
  '待学习题库',
  '已学会题库',
]);

const classifyMaterial = (path: string): MaterialType | null => {
  if (path.includes('当前简历')) return '当前简历';
  if (path.includes('简历深挖')) return '经历深挖';
  if (path.includes('面试准备')) return '面试准备';
  if (path.includes('面试复盘')) return '面试复盘';
  if (
    path.includes('产品 Sense')
    || path.includes('模拟面试')
    || path.includes('题库')
  ) {
    return '训练文档';
  }
  return null;
};

export const collectMaterials = (
  nodes: WorkbenchWikiNode[],
  parentPath = '',
): MaterialItem[] => nodes.flatMap((node: WorkbenchWikiNode): MaterialItem[] => {
  const path: string = `${parentPath}/${node.title}`;
  const type: MaterialType | null = classifyMaterial(path);
  const structuralDocument: boolean =
    STRUCTURAL_MATERIAL_TITLES.has(node.title.trim());
  const current: MaterialItem[] =
    type
    && node.objectType === 'docx'
    && !node.hasChildren
    && node.children.length === 0
    && !structuralDocument
      ? [{ id: node.nodeToken, name: node.title, node, type }]
      : [];
  return [...current, ...collectMaterials(node.children, path)];
});
