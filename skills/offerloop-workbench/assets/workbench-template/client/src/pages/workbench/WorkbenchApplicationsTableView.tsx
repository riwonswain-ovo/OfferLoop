import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
} from 'lucide-react';

import { getWorkbenchDataset } from '@client/src/api';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { cn } from '@client/src/lib/utils';
import type {
  WorkbenchDataset,
  WorkbenchDatasetSource,
  WorkbenchRecord,
  WorkbenchTableMeta,
  WorkbenchViewMeta,
} from '@shared/api.interface';

import {
  cellToText,
  COMPANY_COLUMNS,
  EVENT_COLUMNS,
  EXAM_COLUMNS,
  INTERVIEW_COLUMNS,
  PROGRESS_COLUMNS,
  WorkbenchTable,
} from './WorkbenchDatasetView';
import {
  type WorkbenchDataState,
  useWorkbenchData,
} from './useWorkbenchData';

interface FilterDefinition {
  key: string;
  label: string;
}

const SOURCE_OPTIONS: Array<{
  source: WorkbenchDatasetSource;
  label: string;
}> = [
  { source: 'companies', label: '求职企业清单' },
  { source: 'progress', label: '求职进展' },
  { source: 'events', label: '笔面试中心' },
];

const FILTERS_BY_SOURCE: Record<
  WorkbenchDatasetSource,
  FilterDefinition[]
> = {
  companies: [
    { key: '招聘批次', label: '全部批次' },
    { key: '城市', label: '全部城市' },
    { key: '投递进度', label: '全部进度' },
  ],
  progress: [
    { key: '公司', label: '全部公司' },
    { key: '投递岗位', label: '全部岗位' },
    { key: '进展状态', label: '全部状态' },
  ],
  events: [
    { key: '公司', label: '全部公司' },
    { key: '环节', label: '全部环节' },
    { key: '完成状态', label: '全部状态' },
  ],
};

const getUniqueValues = (
  dataset: WorkbenchDataset,
  fieldName: string,
): string[] => Array.from(
  new Set(
    dataset.records
      .map((record: WorkbenchRecord): string =>
        cellToText(record.fields[fieldName]).trim())
      .filter(Boolean),
  ),
).sort((left: string, right: string): number =>
  left.localeCompare(right, 'zh-CN'));

const ApplicationsTableLoading: React.FC = () => (
  <div className="space-y-3 p-4">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-8 w-48" />
    </div>
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-9 w-4/5" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-72 w-full" />
  </div>
);

const WorkbenchApplicationsTableView: React.FC = () => {
  const state: WorkbenchDataState = useWorkbenchData(false, 15);
  const [searchText, setSearchText] = useState<string>('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [remoteDataset, setRemoteDataset] =
    useState<WorkbenchDataset | null>(null);
  const [remotePage, setRemotePage] = useState<number>(1);
  const [remoteLoading, setRemoteLoading] = useState<boolean>(false);
  const [remoteError, setRemoteError] = useState<string>('');
  const remoteTokensRef = useRef<string[]>(['']);
  const remoteCacheRef = useRef<Map<number, WorkbenchDataset>>(new Map());

  const selectedDataset: WorkbenchDataset | null =
    state.selectedDataset === 'companies'
      ? state.companyDataset
      : state.selectedDataset === 'progress'
        ? state.progressDataset
        : state.eventDataset;
  const selectedPage: number = state.selectedDataset === 'companies'
    ? state.companyPage
    : state.selectedDataset === 'progress'
      ? state.progressPage
      : state.eventPage;
  const hasRemoteFilters: boolean = Boolean(
    searchText.trim() || Object.values(filters).some(Boolean),
  );
  const selectedLoading: boolean = hasRemoteFilters
    ? remoteLoading
    : state.datasetLoading[state.selectedDataset];
  const filterDefinitions: FilterDefinition[] =
    FILTERS_BY_SOURCE[state.selectedDataset];

  const buildRemoteQuery = (pageToken?: string) => ({
    source: state.selectedDataset,
    tableId: state.activeEventTable?.tableId,
    viewId: state.selectedDataset === 'companies'
      ? state.activeCompanyView?.viewId
      : state.selectedDataset === 'progress'
        ? state.activeProgressView?.viewId
        : state.activeEventView?.viewId,
    pageToken,
    searchText: searchText.trim() || undefined,
    filters: Object.fromEntries(
      Object.entries(filters).filter(
        (entry: [string, string]): boolean => Boolean(entry[1]),
      ),
    ),
    pageSize: 15,
  });

  useEffect(() => {
    if (!hasRemoteFilters) {
      setRemoteDataset(null);
      setRemoteError('');
      setRemotePage(1);
      remoteTokensRef.current = [''];
      remoteCacheRef.current.clear();
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout((): void => {
      setRemoteLoading(true);
      setRemoteError('');
      void getWorkbenchDataset(buildRemoteQuery()).then(
        (dataset: WorkbenchDataset): void => {
          if (cancelled) {
            return;
          }
          setRemoteDataset(dataset);
          setRemotePage(1);
          remoteTokensRef.current = ['', dataset.nextPageToken ?? ''];
          remoteCacheRef.current = new Map([[1, dataset]]);
        },
      ).catch((): void => {
        if (!cancelled) {
          setRemoteError('全量搜索暂时不可用，请稍后重试。');
        }
      }).finally((): void => {
        if (!cancelled) {
          setRemoteLoading(false);
        }
      });
    }, 400);
    return (): void => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    filters,
    hasRemoteFilters,
    searchText,
    state.activeCompanyView?.viewId,
    state.activeEventTable?.tableId,
    state.activeEventView?.viewId,
    state.activeProgressView?.viewId,
    state.selectedDataset,
  ]);

  const filteredDataset: WorkbenchDataset | null = hasRemoteFilters
    ? remoteDataset
    : selectedDataset;

  if (state.loading) {
    return <ApplicationsTableLoading />;
  }

  if (!state.data || !selectedDataset || !filteredDataset) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            表格数据暂时无法读取
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {remoteError || state.error || '请稍后刷新，或检查飞书 Base 授权。'}
          </p>
          <Button
            className="mt-3"
            size="sm"
            onClick={() => void state.loadWorkbench()}
          >
            <RefreshCw />
            重新读取
          </Button>
        </div>
      </div>
    );
  }

  const resetLocalFilters = (): void => {
    setSearchText('');
    setFilters({});
  };
  const selectSource = (source: WorkbenchDatasetSource): void => {
    state.setSelectedDataset(source);
    resetLocalFilters();
  };
  const changePage = (nextPage: number): void => {
    if (hasRemoteFilters) {
      const cached: WorkbenchDataset | undefined =
        remoteCacheRef.current.get(nextPage);
      if (cached) {
        setRemoteDataset(cached);
        setRemotePage(nextPage);
        return;
      }
      const pageToken: string | undefined =
        remoteTokensRef.current[nextPage - 1];
      if (!pageToken) {
        return;
      }
      setRemoteLoading(true);
      setRemoteError('');
      void getWorkbenchDataset(buildRemoteQuery(pageToken)).then(
        (dataset: WorkbenchDataset): void => {
          remoteCacheRef.current.set(nextPage, dataset);
          remoteTokensRef.current[nextPage] = dataset.nextPageToken ?? '';
          setRemoteDataset(dataset);
          setRemotePage(nextPage);
        },
      ).catch((): void => {
        setRemoteError('筛选结果翻页失败，请稍后重试。');
      }).finally((): void => setRemoteLoading(false));
      return;
    }
    if (state.selectedDataset === 'companies') {
      void state.changeCompanyPage(nextPage);
    } else if (state.selectedDataset === 'progress') {
      void state.changeProgressPage(nextPage);
    } else {
      void state.changeEventPage(nextPage);
    }
  };
  const columns = state.selectedDataset === 'companies'
    ? COMPANY_COLUMNS
    : state.selectedDataset === 'progress'
      ? PROGRESS_COLUMNS
      : state.activeEventTable?.tableName.includes('笔试')
        ? EXAM_COLUMNS
        : state.activeEventTable?.tableName.includes('全部')
          ? EVENT_COLUMNS
          : INTERVIEW_COLUMNS;
  const hasLocalFilters: boolean = Boolean(
    searchText || Object.values(filters).some(Boolean),
  );

  return (
    <div className="h-full min-h-0 p-3">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">投递进展数据</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              三张表分别读取，每张表每页最多展示 15 条
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a
                href={state.selectedDatasetUrl}
                target="_blank"
                rel="noreferrer"
              >
                打开完整 Base
                <ExternalLink />
              </a>
            </Button>
            <Button
              size="sm"
              disabled={state.loading}
              onClick={() => void state.loadWorkbench()}
            >
              <RefreshCw />
              刷新数据
            </Button>
          </div>
        </div>

        <div className="mx-4 grid grid-cols-3 rounded-lg border bg-muted/40 p-0.5">
          {SOURCE_OPTIONS.map((option) => {
            const sourceDataset: WorkbenchDataset =
              option.source === 'companies'
                ? state.data!.companies
                : option.source === 'progress'
                  ? state.data!.progress
                  : state.data!.events;
            return (
              <button
                key={option.source}
                type="button"
                onClick={() => selectSource(option.source)}
                className={cn(
                  'rounded-md px-3 py-2 text-xs font-medium transition-colors',
                  state.selectedDataset === option.source
                    ? 'bg-background text-blue-600 shadow-sm ring-1 ring-blue-100'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label} · {sourceDataset.total}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {state.selectedDataset === 'companies'
            ? state.data.companyViews.map((view: WorkbenchViewMeta) => (
              <button
                key={view.viewId}
                type="button"
                onClick={() => {
                  resetLocalFilters();
                  void state.selectCompanyView(view.viewId);
                }}
                className={cn(
                  'shrink-0 rounded-md border px-3 py-1.5 text-xs',
                  state.activeCompanyView?.viewId === view.viewId
                    ? 'border-blue-200 bg-blue-50 text-blue-600'
                    : 'bg-background text-muted-foreground',
                )}
              >
                {view.viewName}
              </button>
            ))
            : null}
          {state.selectedDataset === 'progress'
            ? state.data.progressViews.map((view: WorkbenchViewMeta) => (
              <button
                key={view.viewId}
                type="button"
                onClick={() => {
                  resetLocalFilters();
                  void state.selectProgressView(view.viewId);
                }}
                className={cn(
                  'shrink-0 rounded-md border px-3 py-1.5 text-xs',
                  state.activeProgressView?.viewId === view.viewId
                    ? 'border-blue-200 bg-blue-50 text-blue-600'
                    : 'bg-background text-muted-foreground',
                )}
              >
                {view.viewName}
              </button>
            ))
            : null}
          {state.selectedDataset === 'events'
            ? state.data.eventTables.map((table: WorkbenchTableMeta) => (
              <button
                key={table.tableId}
                type="button"
                onClick={() => {
                  resetLocalFilters();
                  void state.selectEventTable(table.tableId);
                }}
                className={cn(
                  'shrink-0 rounded-md border px-3 py-1.5 text-xs',
                  state.activeEventTable?.tableId === table.tableId
                    ? 'border-blue-200 bg-blue-50 text-blue-600'
                    : 'bg-background text-muted-foreground',
                )}
              >
                {table.tableName}
              </button>
            ))
            : null}
        </div>

        {state.selectedDataset === 'events'
          && state.activeEventTable
          && state.activeEventTable.views.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-t px-4 py-2">
              {state.activeEventTable.views.map((view: WorkbenchViewMeta) => (
                <button
                  key={view.viewId}
                  type="button"
                  onClick={() => {
                    resetLocalFilters();
                    void state.selectEventView(view.viewId);
                  }}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-[11px]',
                    state.activeEventView?.viewId === view.viewId
                      ? 'bg-slate-900 text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {view.viewName}
                </button>
              ))}
            </div>
          ) : null}

        <div className="grid gap-2 border-t px-4 py-3 lg:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(120px,0.48fr))_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setSearchText(event.target.value)}
              placeholder="搜索公司 / 招聘项目 / 岗位"
              className="h-9 pl-9 text-xs"
            />
          </div>
          {filterDefinitions.map((definition: FilterDefinition) => (
            <select
              key={definition.key}
              value={filters[definition.key] ?? ''}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setFilters((current: Record<string, string>) => ({
                  ...current,
                  [definition.key]: event.target.value,
                }))}
              className="h-9 rounded-md border bg-background px-3 text-xs outline-none focus:border-blue-400"
              aria-label={definition.label}
            >
              <option value="">{definition.label}</option>
              {getUniqueValues(selectedDataset, definition.key).map(
                (value: string) => (
                  <option key={value} value={value}>{value}</option>
                ),
              )}
            </select>
          ))}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9',
              hasLocalFilters && 'border-blue-200 text-blue-600',
            )}
            onClick={resetLocalFilters}
          >
            <Filter />
            {hasLocalFilters ? '清除筛选' : '筛选'}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden border-t px-3 pb-3">
          <div className="h-full min-w-0">
            {filteredDataset.records.length === 0 ? (
              <div className="border-b py-10 text-center text-xs text-muted-foreground">
                没有符合条件的记录
              </div>
            ) : null}
            <WorkbenchTable
              dataset={filteredDataset}
              columns={columns}
              page={hasRemoteFilters ? remotePage : selectedPage}
              loading={selectedLoading}
              onPageChange={changePage}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export { WorkbenchApplicationsTableView };
