import type { WorkbenchWikiNode } from '@shared/api.interface';

import { isWikiFolderNode } from './workbench-wiki-nodes';

export type MaterialType =
  | '简历合集'
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

const classifyMaterial = (path: string): MaterialType | null => {
  if (path.includes('简历合集') || path.includes('当前简历')) {
    return '简历合集';
  }
  if (path.includes('经历深挖') || path.includes('简历深挖')) {
    return '经历深挖';
  }
  if (path.includes('面试准备')) return '面试准备';
  if (path.includes('面试复盘')) return '面试复盘';
  if (
    path.includes('产品 Sense') ||
    path.includes('模拟面试') ||
    path.includes('题库')
  ) {
    return '训练文档';
  }
  return null;
};

export const collectMaterials = (
  nodes: WorkbenchWikiNode[],
  parentPath = '',
): MaterialItem[] =>
  nodes.flatMap((node: WorkbenchWikiNode): MaterialItem[] => {
    const path: string = `${parentPath}/${node.title}`;
    const type: MaterialType | null = classifyMaterial(path);
    const current: MaterialItem[] =
      type && node.objectType === 'docx' && !isWikiFolderNode(node)
        ? [{ id: node.nodeToken, name: node.title, node, type }]
        : [];
    return [...current, ...collectMaterials(node.children, path)];
  });
