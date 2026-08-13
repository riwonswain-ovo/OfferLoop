import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ExternalLink,
  FileText,
  Info,
  LayoutGrid,
  RefreshCw,
  Table2,
} from 'lucide-react';

import {
  getWorkbenchApplications,
  getWorkbenchDataset,
} from '@client/src/api';
import { Button } from '@client/src/components/ui/button';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { cn } from '@client/src/lib/utils';
import type {
  WorkbenchApplicationsResponse,
  WorkbenchDataset,
  WorkbenchRecord,
  WorkbenchStageCount,
} from '@shared/api.interface';

import {
  cellToDisplayText,
  cellToText,
  PROGRESS_STAGE_ORDER,
} from './WorkbenchDatasetView';
import { WorkbenchApplicationsTableView } from './WorkbenchApplicationsTableView';

type ApplicationsViewMode = 'kanban' | 'table';

interface StageVisual {
  headerClassName: string;
  cardClassName: string;
}

const STAGE_VISUALS: StageVisual[] = [
  {
    headerClassName: 'border-blue-200 bg-blue-50/70',
    cardClassName: 'border-blue-100',
  },
  {
    headerClassName: 'border-violet-200 bg-violet-50/70',
    cardClassName: 'border-violet-100',
  },
  {
    headerClassName: 'border-fuchsia-200 bg-fuchsia-50/70',
    cardClassName: 'border-fuchsia-100',
  },
  {
    headerClassName: 'border-sky-200 bg-sky-50/70',
    cardClassName: 'border-sky-100',
  },
  {
    headerClassName: 'border-amber-200 bg-amber-50/70',
    cardClassName: 'border-amber-100',
  },
  {
    headerClassName: 'border-cyan-200 bg-cyan-50/70',
    cardClassName: 'border-cyan-100',
  },
  {
    headerClassName: 'border-purple-200 bg-purple-50/70',
    cardClassName: 'border-purple-100',
  },
  {
    headerClassName: 'border-emerald-200 bg-emerald-50/70',
    cardClassName: 'border-emerald-100',
  },
  {
    headerClassName: 'border-slate-200 bg-slate-50/80',
    cardClassName: 'border-slate-200',
  },
];

const ApplicationsLoading: React.FC = () => (
  <main className="flex h-[calc(100vh-50px)] flex-col gap-4 overflow-hidden p-5 lg:p-6">
    <Skeleton className="h-10 w-44" />
    <Skeleton className="h-8 w-full" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="min-h-0 w-full flex-1" />
  </main>
);

const WorkbenchApplicationsPage: React.FC = () => {
  const [response, setResponse] =
    useState<WorkbenchApplicationsResponse | null>(null);
  const [dataset, setDataset] = useState<WorkbenchDataset | null>(null);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [datasetLoading, setDatasetLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [viewMode, setViewMode] =
    useState<ApplicationsViewMode>('kanban');
  const cacheRef = useRef<Map<number, WorkbenchDataset>>(new Map());
  const pageTokensRef = useRef<string[]>(['']);

  const loadOverview = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const nextResponse: WorkbenchApplicationsResponse =
        await getWorkbenchApplications();
      setResponse(nextResponse);
      setDataset(nextResponse.progress);
      setPage(1);
      cacheRef.current = new Map([[1, nextResponse.progress]]);
      pageTokensRef.current = [''];
      if (nextResponse.progress.nextPageToken) {
        pageTokensRef.current[1] = nextResponse.progress.nextPageToken;
      }
    } catch (_error: unknown) {
      setError('暂时无法读取求职进展，请稍后刷新或检查飞书授权。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const changePage = async (nextPage: number): Promise<void> => {
    if (!response || nextPage < 1) {
      return;
    }
    const cached: WorkbenchDataset | undefined =
      cacheRef.current.get(nextPage);
    if (cached) {
      setDataset(cached);
      setPage(nextPage);
      return;
    }
    const pageToken: string | undefined =
      pageTokensRef.current[nextPage - 1];
    if (!pageToken) {
      return;
    }
    setDatasetLoading(true);
    setError('');
    try {
      const nextDataset: WorkbenchDataset = await getWorkbenchDataset({
        source: 'progress',
        viewId: response.progressView.viewId,
        pageToken,
      });
      cacheRef.current.set(nextPage, nextDataset);
      if (nextDataset.nextPageToken) {
        pageTokensRef.current[nextPage] = nextDataset.nextPageToken;
      }
      setDataset(nextDataset);
      setPage(nextPage);
    } catch (_error: unknown) {
      setError('分页数据读取失败，请稍后重试。');
    } finally {
      setDatasetLoading(false);
    }
  };

  const stageCounts: Map<string, number> = useMemo(
    () => new Map(
      (response?.stageCounts ?? []).map(
        (item: WorkbenchStageCount): [string, number] => [
          item.stage,
          item.count,
        ],
      ),
    ),
    [response],
  );
  const groupedRecords: Map<string, WorkbenchRecord[]> = useMemo(() => {
    const grouped: Map<string, WorkbenchRecord[]> = new Map();
    (dataset?.records ?? []).forEach((record: WorkbenchRecord): void => {
      const result: string = cellToText(record.fields['流程结果']) || '进行中';
      const next: string = cellToText(record.fields['下一环节']) || '待反馈';
      const stage: string = result === 'Offer'
        ? 'Offer'
        : ['未通过', '主动放弃', '岗位关闭'].includes(result)
          ? '已结束'
          : next === '待反馈'
            ? '待反馈'
            : `待${next}`;
      grouped.set(stage, [...(grouped.get(stage) ?? []), record]);
    });
    return grouped;
  }, [dataset]);
  if (loading) {
    return <ApplicationsLoading />;
  }

  if (!response || !dataset) {
    return (
      <main className="p-6">
        <section className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
          <h1 className="text-xl font-semibold">投递管理暂不可用</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || '求职进展数据尚未配置。'}
          </p>
          <Button className="mt-4" onClick={() => void loadOverview()}>
            <RefreshCw />
            重新读取
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="h-[calc(100vh-50px)] overflow-hidden bg-[#F5F6F7] p-3 lg:p-4">
      <div className="mx-auto flex h-full max-w-[1320px] flex-col gap-2">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">投递管理</h1>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a
                href={dataset.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                打开完整 Base
                <ExternalLink />
              </a>
            </Button>
            <Button
              size="sm"
              disabled={loading}
              onClick={() => void loadOverview()}
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              刷新数据
            </Button>
          </div>
        </header>

        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-xs text-slate-600">
          <Info className="size-4 shrink-0 text-blue-600" />
          <span>
            工作台默认只读；更新阶段请打开 Base。自动处理请从首页能力按钮新建 Codex 任务。
          </span>
        </div>

        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </div>
        ) : null}

        <section className="shrink-0 overflow-x-auto rounded-xl border bg-background shadow-sm">
          <div
            className="grid min-w-[1100px]"
            style={{ gridTemplateColumns: `repeat(${PROGRESS_STAGE_ORDER.length}, minmax(96px, 1fr))` }}
          >
            {PROGRESS_STAGE_ORDER.map((stage: string, index: number) => (
              <div
                key={stage}
                className={cn(
                  'border-r px-3 py-2 last:border-r-0',
                  index === 0 ? '' : 'border-l-0',
                )}
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {stage}
                </p>
                <p className="mt-0.5 text-lg font-semibold">
                  {stageCounts.get(stage) ?? 0}
                </p>
                <p className="mt-0.5 truncate text-[8px] text-muted-foreground">
                  来自求职进展 Base
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-3 py-1.5">
            <div className="flex rounded-lg border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  viewMode === 'kanban'
                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                <LayoutGrid className="size-3.5" />
                看板视图
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                <Table2 className="size-3.5" />
                表格视图
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {viewMode === 'table'
                ? '表格视图 · 每页最多 15 条'
                : `第 ${page} 页 · 每页最多 9 条`}
            </p>
          </div>

          {viewMode === 'kanban' ? (
            <div className={cn(
              'flex min-h-0 flex-1 flex-col overflow-x-auto',
              datasetLoading && 'opacity-60',
            )}>
              <div className="flex min-h-0 min-w-max flex-1">
                {PROGRESS_STAGE_ORDER.map((stage: string, index: number) => {
                  const visual: StageVisual = STAGE_VISUALS[index % STAGE_VISUALS.length];
                  const records: WorkbenchRecord[] =
                    groupedRecords.get(stage) ?? [];
                  const visibleRecords: WorkbenchRecord[] =
                    records.slice(0, 3);
                  const total: number = stageCounts.get(stage) ?? 0;
                  return (
                    <div
                      key={stage}
                      className={cn(
                        'flex w-[174px] shrink-0 flex-col border-r last:border-r-0',
                        visual.headerClassName,
                      )}
                    >
                      <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium">
                        <span>{stage}</span>
                        <span className="text-muted-foreground">{total}</span>
                      </div>
                      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {visibleRecords.map((record: WorkbenchRecord) => {
                          const company: string =
                            cellToText(record.fields['公司'])
                            || '未命名公司';
                          const role: string =
                            cellToText(record.fields['投递岗位'])
                            || '岗位待填写';
                          const submittedAt: string = cellToDisplayText(
                            '投递日期',
                            record.fields['投递日期'],
                          );
                          const resumeVersion: string =
                            cellToText(record.fields['投递简历版本']);
                          return (
                            <article
                              key={record.recordId}
                              className={cn(
                                'rounded-lg border bg-background p-2.5 shadow-sm',
                                visual.cardClassName,
                              )}
                            >
                              <p className="truncate text-xs font-semibold">
                                {company}
                              </p>
                              <p
                                className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-slate-700"
                                title={role}
                              >
                                {role}
                              </p>
                              <div className="mt-2 space-y-1 text-[9px] text-muted-foreground">
                                <p className="flex items-center gap-1">
                                  <CalendarDays className="size-3" />
                                  投递日期 {submittedAt || '待填写'}
                                </p>
                                <p className="flex items-center gap-1">
                                  <FileText className="size-3" />
                                  简历版本 {resumeVersion || '待确认'}
                                </p>
                              </div>
                              <a
                                href={dataset.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-blue-600"
                              >
                                查看详情
                                <ExternalLink className="size-2.5" />
                              </a>
                            </article>
                          );
                        })}
                        {records.length === 0 ? (
                          <p className="rounded-lg border border-dashed bg-background/50 px-2 py-5 text-center text-[10px] text-muted-foreground">
                            当前页暂无记录
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 border-t bg-background/60 px-3 py-1.5 text-[10px] text-blue-600">
                        {total > visibleRecords.length
                          ? `＋ 还有 ${total - visibleRecords.length} 条`
                          : `本页 ${visibleRecords.length} 条`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex shrink-0 items-center justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
                <span>共 {dataset.total} 条投递记录</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={datasetLoading || page <= 1}
                    onClick={() => void changePage(page - 1)}
                  >
                    上一页
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      datasetLoading
                      || (!dataset.hasMore && !cacheRef.current.has(page + 1))
                    }
                    onClick={() => void changePage(page + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              <WorkbenchApplicationsTableView />
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export { WorkbenchApplicationsPage };
