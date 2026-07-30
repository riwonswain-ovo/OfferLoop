import React, { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  FileCheck2,
  FilePenLine,
  FileSearch,
  FileText,
  FolderOpen,
  RefreshCw,
  Search,
} from 'lucide-react';

import { Button } from '@client/src/components/ui/button';
import {
  buildCodexTaskUrl,
  buildOfferLoopPrompt,
} from '@client/src/lib/codex-task';
import { cn } from '@client/src/lib/utils';
import type {
  WorkbenchWikiDirectoryResponse,
  WorkbenchWikiNode,
} from '@shared/api.interface';

import {
  collectMaterials,
  type MaterialItem,
  type MaterialType,
} from './workbench-materials';

interface MaterialVisual {
  icon: LucideIcon;
  badgeClassName: string;
}

const TYPE_VISUALS: Record<MaterialType, MaterialVisual> = {
  当前简历: { icon: FileText, badgeClassName: 'bg-blue-50 text-blue-600' },
  经历深挖: { icon: Search, badgeClassName: 'bg-blue-50 text-blue-600' },
  面试准备: {
    icon: FileSearch,
    badgeClassName: 'bg-violet-50 text-violet-600',
  },
  面试复盘: {
    icon: FileCheck2,
    badgeClassName: 'bg-emerald-50 text-emerald-600',
  },
  训练文档: {
    icon: FilePenLine,
    badgeClassName: 'bg-violet-50 text-violet-600',
  },
};

const ARTIFACT_TYPES: Array<'全部产物' | Exclude<MaterialType, '当前简历'>> = [
  '全部产物',
  '经历深挖',
  '面试准备',
  '面试复盘',
  '训练文档',
];

interface WorkbenchMaterialsPageProps {
  directory: WorkbenchWikiDirectoryResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onNodeSelect: (node: WorkbenchWikiNode) => void;
}

const findCurrentResumeNode = (
  nodes: WorkbenchWikiNode[],
): WorkbenchWikiNode | undefined => {
  for (const node of nodes) {
    if (node.title.trim() === '01｜当前简历') return node;
    const childMatch: WorkbenchWikiNode | undefined =
      findCurrentResumeNode(node.children);
    if (childMatch) return childMatch;
  }
  return undefined;
};

const MaterialRows: React.FC<{
  items: MaterialItem[];
  onNodeSelect: (node: WorkbenchWikiNode) => void;
}> = ({ items, onNodeSelect }) => (
  <div className="min-h-0 flex-1 overflow-auto">
    <table className="w-full min-w-[620px] text-left">
      <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] text-slate-600">
        <tr>
          <th className="px-5 py-3 font-medium">产物名称</th>
          <th className="w-32 px-4 py-3 font-medium">类型</th>
          <th className="w-20 px-4 py-3 font-medium">入口</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {items.map((material: MaterialItem) => {
          const visual: MaterialVisual = TYPE_VISUALS[material.type];
          const Icon: LucideIcon = visual.icon;
          return (
            <tr key={material.id} className="text-xs hover:bg-slate-50/70">
              <td className="px-5 py-3.5">
                <button
                  type="button"
                  className="flex max-w-full items-center gap-2 text-left hover:text-blue-600"
                  onClick={() => onNodeSelect(material.node)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-blue-600" />
                  <span className="truncate">{material.name}</span>
                </button>
              </td>
              <td className="px-4 py-3.5">
                <span className={cn(
                  'inline-flex rounded px-2 py-1 text-[10px]',
                  visual.badgeClassName,
                )}>
                  {material.type}
                </span>
              </td>
              <td className="px-4 py-3.5">
                <button
                  type="button"
                  className="font-medium text-blue-600 hover:underline"
                  onClick={() => onNodeSelect(material.node)}
                >
                  打开
                </button>
              </td>
            </tr>
          );
        })}
        {items.length === 0 ? (
          <tr>
            <td colSpan={3} className="px-5 py-20 text-center text-xs text-muted-foreground">
              暂无匹配的训练产物
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  </div>
);

const WorkbenchMaterialsPage: React.FC<WorkbenchMaterialsPageProps> = ({
  directory,
  loading,
  onRefresh,
  onNodeSelect,
}) => {
  const [query, setQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] =
    useState<(typeof ARTIFACT_TYPES)[number]>('全部产物');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const materials: MaterialItem[] = useMemo(
    () => collectMaterials(directory?.nodes ?? []),
    [directory],
  );
  const artifacts: MaterialItem[] = useMemo(() => {
    const normalized: string = query.trim().toLowerCase();
    return materials.filter((item: MaterialItem): boolean =>
      item.type !== '当前简历'
      && (!normalized || item.name.toLowerCase().includes(normalized))
      && (typeFilter === '全部产物' || item.type === typeFilter));
  }, [materials, query, typeFilter]);
  const deepDiveMaterials: MaterialItem[] = materials
    .filter((item: MaterialItem): boolean => item.type === '经历深挖')
    .slice(0, 3);
  const collectedResumes: MaterialItem[] = materials
    .filter((item: MaterialItem): boolean => item.type === '当前简历')
    .slice(0, 3);
  const currentResumeNode: WorkbenchWikiNode | undefined =
    findCurrentResumeNode(directory?.nodes ?? []);
  const resumes: MaterialItem[] = collectedResumes.length > 0
    ? collectedResumes
    : currentResumeNode
      ? [{
        id: currentResumeNode.nodeToken,
        name: currentResumeNode.title,
        type: '当前简历',
        node: currentResumeNode,
      }]
      : [];

  const refreshMaterials = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main className="h-[calc(100vh-50px)] overflow-hidden bg-[#F5F6F7] p-3 lg:p-4">
      <div className="mx-auto flex h-full max-w-[1320px] min-h-0 flex-col gap-3">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">材料中心</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              左侧查看最近训练产物；右侧保留经历深挖与当前简历入口。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!directory?.nodes[0]}
              onClick={() => {
                const firstNode: WorkbenchWikiNode | undefined =
                  directory?.nodes[0];
                if (firstNode) onNodeSelect(firstNode);
              }}
            >
              <FolderOpen /> 打开飞书知识库
            </Button>
            <Button size="sm" onClick={() => void refreshMaterials()}>
              {refreshing || loading ? '刷新中' : '刷新材料'}
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background">
            <div className="shrink-0 border-b p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">最近训练产物</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    来自飞书知识库，内容过多时在本区块内滚动。
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  共 {artifacts.length} 份
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <label className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索训练产物"
                    className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-xs outline-none focus:border-blue-500"
                  />
                </label>
                <label className="relative w-36 shrink-0">
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(
                      event.target.value as (typeof ARTIFACT_TYPES)[number],
                    )}
                    className="h-9 w-full appearance-none rounded-lg border bg-background px-3 pr-8 text-xs outline-none"
                  >
                    {ARTIFACT_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                </label>
              </div>
            </div>
            <MaterialRows items={artifacts} onNodeSelect={onNodeSelect} />
          </section>

          <aside className="grid min-h-0 grid-rows-2 gap-3">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-blue-200 bg-background p-4">
              <div className="shrink-0">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Search className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold">经历深挖</h2>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      自然讲述 → 连续追问 → 确认后写入飞书
                    </p>
                  </div>
                </div>
              </div>
              <div className="my-3 min-h-0 flex-1 space-y-2 overflow-auto">
                {deepDiveMaterials.map((item: MaterialItem) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNodeSelect(item.node)}
                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-xs hover:border-blue-200"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 text-blue-600">打开</span>
                  </button>
                ))}
                {deepDiveMaterials.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    暂无已完成的经历材料
                  </p>
                ) : null}
              </div>
              <Button asChild className="w-full shrink-0">
                <a href={buildCodexTaskUrl(buildOfferLoopPrompt(
                  'experience-deepthink',
                  '我想开始一次经历深挖。请先让我自然讲述一段具体经历，'
                  + '一次只追问一个问题，确认后再写入飞书知识库。',
                ))}>
                  开始经历深挖
                </a>
              </Button>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-blue-200 bg-background p-4">
              <div className="shrink-0">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold">当前简历</h2>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      查看当前版本，或针对目标岗位新建一份简历
                    </p>
                  </div>
                </div>
              </div>
              <div className="my-3 min-h-0 flex-1 space-y-2 overflow-auto">
                {resumes.map((item: MaterialItem, index: number) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNodeSelect(item.node)}
                    className="w-full rounded-lg border p-3 text-left hover:border-blue-200"
                  >
                    <span className="block truncate text-xs font-medium">
                      {item.name}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {index === 0 ? '当前使用版本' : '历史版本'}
                    </span>
                  </button>
                ))}
                {resumes.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    暂无当前简历
                  </p>
                ) : null}
              </div>
              <Button asChild className="w-full shrink-0">
                <a href={buildCodexTaskUrl(buildOfferLoopPrompt(
                  'resume-tailor',
                  '我想针对目标岗位制作一份简历。请先让我确认岗位和选择经历，'
                  + '生成前再次向我确认。',
                ))}>
                  新建岗位简历
                </a>
              </Button>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
};

export { WorkbenchMaterialsPage };
