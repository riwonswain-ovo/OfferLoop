import React, { useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  FileText,
  Folder,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
} from 'lucide-react';

import type {
  WorkbenchWikiDirectoryResponse,
  WorkbenchWikiNode,
} from '@shared/api.interface';

import {
  Collapsible,
  CollapsibleContent,
} from '@client/src/components/ui/collapsible';
import { ScrollArea } from '@client/src/components/ui/scroll-area';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { cn } from '@client/src/lib/utils';
import { WorkbenchBrandMark } from './WorkbenchTopNav';

interface WorkbenchWikiSidebarProps {
  open: boolean;
  directory: WorkbenchWikiDirectoryResponse | null;
  loading: boolean;
  error: string;
  activeNodeToken: string | null;
  onOpenChange: (open: boolean) => void;
  onWorkbenchSelect: () => void;
  onNodeSelect: (node: WorkbenchWikiNode) => void;
  onRefresh: () => Promise<void>;
}

interface WikiTreeNodeProps {
  node: WorkbenchWikiNode;
  depth: number;
  activeNodeToken: string | null;
  onSelect: (node: WorkbenchWikiNode) => void;
}

const WikiTreeNode: React.FC<WikiTreeNodeProps> = ({
  node,
  depth,
  activeNodeToken,
  onSelect,
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const active: boolean = activeNodeToken === node.nodeToken;
  const hasChildren: boolean = node.children.length > 0;
  const NodeIcon = hasChildren ? Folder : FileText;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div
        className={cn(
          'group flex h-[30px] items-center rounded-md text-[12.5px] transition-colors',
          active
            ? 'bg-[rgba(51,112,255,0.20)] font-medium text-white'
            : 'text-white/[0.78] hover:bg-white/[0.07] hover:text-white',
        )}
        style={{ paddingLeft: `${Math.min(depth, 6) * 19 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? `收起${node.title}` : `展开${node.title}`}
            onClick={() => {
              setExpanded((current: boolean): boolean => !current);
            }}
            className="flex size-[13px] shrink-0 items-center justify-center text-white/40"
          >
            <ChevronRight
              className={cn(
                'size-[13px] transition-transform duration-150',
                expanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        <button
          type="button"
          onClick={() => {
            onSelect(node);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left"
        >
          <NodeIcon className="size-[13px] shrink-0 text-white/50" />
          <span className="truncate">{node.title}</span>
        </button>
      </div>
      {hasChildren ? (
        <CollapsibleContent>
          {node.children.map((child: WorkbenchWikiNode) => (
            <WikiTreeNode
              key={child.nodeToken}
              node={child}
              depth={depth + 1}
              activeNodeToken={activeNodeToken}
              onSelect={onSelect}
            />
          ))}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
};

const WorkbenchWikiSidebar: React.FC<WorkbenchWikiSidebarProps> = ({
  open,
  directory,
  loading,
  error,
  activeNodeToken,
  onOpenChange,
  onWorkbenchSelect,
  onNodeSelect,
  onRefresh,
}) => {
  const selectNode = (node: WorkbenchWikiNode): void => {
    onNodeSelect(node);
    if (!window.matchMedia('(min-width: 768px)').matches) {
      onOpenChange(false);
    }
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="关闭知识库目录"
          onClick={() => {
            onOpenChange(false);
          }}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] md:hidden"
        />
      ) : null}

      <aside
        aria-label="OfferLoop 知识库目录"
        className={cn(
          'fixed inset-y-0 left-0 z-40 bg-[#1F2329] text-white/85 transition-[width,transform] duration-200',
          open
            ? 'w-[248px] translate-x-0'
            : '-translate-x-full md:w-[58px] md:translate-x-0',
        )}
      >
        {open ? (
          <div className="flex h-full flex-col px-2.5 pt-3.5 pb-2.5">
            <div className="mb-2.5 flex items-center gap-[9px] border-b border-white/[0.08] px-1.5 pb-3">
              <WorkbenchBrandMark className="size-[30px] rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold leading-tight text-white">
                  OfferLoop
                </p>
                <p className="truncate text-[11px] text-white/45">
                  OfferLoop 求职空间
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onWorkbenchSelect}
              className={cn(
                'mb-2.5 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors',
                activeNodeToken
                  ? 'text-white/75 hover:bg-white/[0.07] hover:text-white'
                  : 'bg-[rgba(51,112,255,0.20)] text-white',
              )}
            >
              <Home className="size-[15px] shrink-0 text-[#9DBCFF]" />
              <span>工作台</span>
            </button>

            <div className="flex items-center justify-between px-2 pt-0.5 pb-1.5">
              <p className="text-[11px] tracking-[0.5px] text-white/35">
                知识库
              </p>
              <button
                type="button"
                aria-label="刷新知识库目录"
                disabled={loading}
                onClick={() => {
                  void onRefresh();
                }}
                data-ai-section-type="button"
                className="flex size-5 items-center justify-center rounded text-white/40 transition-colors hover:text-white disabled:opacity-50"
              >
                <RefreshCw
                  className={cn('size-[13px]', loading && 'animate-spin')}
                />
              </button>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {loading && !directory ? (
                <div className="space-y-1.5 px-1 py-1">
                  {Array.from(
                    { length: 6 },
                    (_value: unknown, index: number) => (
                      <Skeleton
                        key={index}
                        className="h-[30px] w-full rounded-md bg-white/10"
                      />
                    ),
                  )}
                </div>
              ) : null}
              {error && !directory ? (
                <div className="mx-1 rounded-md border border-red-400/30 bg-red-400/10 p-3 text-[12.5px] text-red-200">
                  <p className="font-medium">目录加载失败</p>
                  <p className="mt-1 text-[11px] text-red-200/80">{error}</p>
                </div>
              ) : null}
              {directory?.nodes.map((node: WorkbenchWikiNode) => (
                <WikiTreeNode
                  key={node.nodeToken}
                  node={node}
                  depth={0}
                  activeNodeToken={activeNodeToken}
                  onSelect={selectNode}
                />
              ))}
            </ScrollArea>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-2.5 flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-white/50 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <PanelLeftClose className="size-[15px] shrink-0" />
              <span>收起侧栏</span>
            </button>
          </div>
        ) : (
          <div className="hidden h-full flex-col items-center gap-2.5 py-3.5 md:flex">
            <button
              type="button"
              aria-label="展开知识库目录"
              onClick={() => {
                onOpenChange(true);
              }}
              data-ai-section-type="button"
              className="flex size-9 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <PanelLeftOpen className="size-4" />
            </button>
            <div className="h-px w-8 bg-white/10" />
            <button
              type="button"
              aria-label="打开 OfferLoop 工作台"
              title="OfferLoop 工作台"
              onClick={onWorkbenchSelect}
              data-ai-section-type="button"
              className={cn(
                'flex size-9 items-center justify-center rounded-md transition-colors',
                activeNodeToken
                  ? 'text-white/60 hover:bg-white/[0.07] hover:text-white'
                  : 'bg-[rgba(51,112,255,0.20)] text-white',
              )}
            >
              <Home className="size-4" />
            </button>
            <button
              type="button"
              aria-label="展开飞书知识库目录"
              title="飞书知识库"
              onClick={() => {
                onOpenChange(true);
              }}
              data-ai-section-type="button"
              className={cn(
                'flex size-9 items-center justify-center rounded-md transition-colors',
                activeNodeToken
                  ? 'bg-[rgba(51,112,255,0.20)] text-white'
                  : 'text-white/60 hover:bg-white/[0.07] hover:text-white',
              )}
            >
              <BookOpen className="size-4" />
            </button>
          </div>
        )}
      </aside>

      {!open ? (
        <button
          type="button"
          aria-label="展开知识库目录"
          onClick={() => {
            onOpenChange(true);
          }}
          data-ai-section-type="button"
          className="fixed top-3 left-3 z-30 flex size-9 items-center justify-center rounded-md border border-[#E5E6EB] bg-white text-[#646A73] shadow-lg md:hidden"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      ) : null}
    </>
  );
};

export { WorkbenchWikiSidebar };
