import React from 'react';
import dayjs from 'dayjs';
import {
  BookOpen,
  BriefcaseBusiness,
  ExternalLink,
  FileSearch,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import type {
  WorkbenchDatasetSource,
  WorkbenchTableMeta,
  WorkbenchViewMeta,
} from '@shared/api.interface';

import { Alert, AlertDescription, AlertTitle } from '@client/src/components/ui/alert';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Skeleton } from '@client/src/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';

import { WorkbenchCalendar } from './WorkbenchCalendar';
import {
  COMPANY_COLUMNS,
  EVENT_COLUMNS,
  EXAM_COLUMNS,
  INTERVIEW_COLUMNS,
  PROGRESS_COLUMNS,
  ProgressKanban,
  WorkbenchTable,
} from './WorkbenchDatasetView';
import {
  type WorkbenchDataState,
  useWorkbenchData,
} from './useWorkbenchData';

const WorkbenchSkeleton: React.FC = () => (
  <div className="min-h-screen bg-muted/40 p-4 md:p-8">
    <div className="mx-auto max-w-[1600px] space-y-6">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Skeleton className="h-[430px]" />
        <Skeleton className="h-[430px]" />
      </div>
      <Skeleton className="h-[420px]" />
    </div>
  </div>
);

const TrainingCard: React.FC = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-xl">
        <Sparkles className="size-5 text-primary" />
        今日训练
      </CardTitle>
      <CardDescription>
        先保留固定位置，后续由专用 Skill 自动生成
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <FileSearch className="size-4 text-primary" />
          简历深挖 · 5 题
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_value: unknown, index: number) => (
            <div
              key={`resume-${index + 1}`}
              className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              第 {index + 1} 题将在简历深挖 Skill 启用后生成
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <BookOpen className="size-4 text-primary" />
          产品 Sense · 2 题
        </div>
        <div className="space-y-2">
          {Array.from({ length: 2 }, (_value: unknown, index: number) => (
            <div
              key={`sense-${index + 1}`}
              className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              第 {index + 1} 题将在产品 Sense Skill 启用后生成
            </div>
          ))}
        </div>
      </div>
    </CardContent>
  </Card>
);

const WorkbenchDataCard: React.FC<{ state: WorkbenchDataState }> = ({
  state,
}) => {
  if (
    !state.data
    || !state.companyDataset
    || !state.progressDataset
    || !state.eventDataset
  ) {
    return null;
  }
  const eventColumns = state.activeEventTable?.tableName === '笔试'
    ? EXAM_COLUMNS
    : state.activeEventTable?.tableName === '全部安排'
      ? EVENT_COLUMNS
      : INTERVIEW_COLUMNS;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-xl">投递进展数据</CardTitle>
            <CardDescription>
              数据按需同步，每个 Base 与子视图每页展示 30 条
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={state.selectedDatasetUrl} target="_blank" rel="noreferrer">
              打开完整 Base
              <ExternalLink />
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={state.selectedDataset}
          onValueChange={(value: string): void =>
            state.setSelectedDataset(value as WorkbenchDatasetSource)}
        >
          <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="companies">
              求职企业清单 · {state.companyDataset.total}
            </TabsTrigger>
            <TabsTrigger value="progress">
              求职进展 · {state.progressDataset.total}
            </TabsTrigger>
            <TabsTrigger value="events">
              笔面试中心 · {state.eventDataset.total}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies">
            <Tabs
              value={state.activeCompanyView?.viewId ?? ''}
              onValueChange={(viewId: string): void => {
                void state.selectCompanyView(viewId);
              }}
            >
              <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60">
                {state.data.companyViews.map((view: WorkbenchViewMeta) => (
                  <TabsTrigger key={view.viewId} value={view.viewId}>
                    {view.viewName}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <WorkbenchTable
              dataset={state.companyDataset}
              columns={COMPANY_COLUMNS}
              page={state.companyPage}
              loading={state.datasetLoading.companies}
              onPageChange={(page: number): void => {
                void state.changeCompanyPage(page);
              }}
            />
          </TabsContent>

          <TabsContent value="progress">
            <Tabs
              value={state.activeProgressView?.viewId ?? ''}
              onValueChange={(viewId: string): void => {
                void state.selectProgressView(viewId);
              }}
            >
              <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60">
                {state.data.progressViews.map((view: WorkbenchViewMeta) => (
                  <TabsTrigger key={view.viewId} value={view.viewId}>
                    {view.viewName}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {state.activeProgressView?.viewType === 'kanban' ? (
              <ProgressKanban
                dataset={state.progressDataset}
                page={state.progressPage}
                loading={state.datasetLoading.progress}
                onPageChange={(page: number): void => {
                  void state.changeProgressPage(page);
                }}
              />
            ) : (
              <WorkbenchTable
                dataset={state.progressDataset}
                columns={PROGRESS_COLUMNS}
                page={state.progressPage}
                loading={state.datasetLoading.progress}
                onPageChange={(page: number): void => {
                  void state.changeProgressPage(page);
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="events">
            <Tabs
              value={state.activeEventTable?.tableId ?? ''}
              onValueChange={(tableId: string): void => {
                void state.selectEventTable(tableId);
              }}
            >
              <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60">
                {state.data.eventTables.map((table: WorkbenchTableMeta) => (
                  <TabsTrigger key={table.tableId} value={table.tableId}>
                    {table.tableName}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Tabs
              value={state.activeEventView?.viewId ?? ''}
              onValueChange={(viewId: string): void => {
                void state.selectEventView(viewId);
              }}
            >
              <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40">
                {(state.activeEventTable?.views ?? []).map(
                  (view: WorkbenchViewMeta) => (
                    <TabsTrigger key={view.viewId} value={view.viewId}>
                      {view.viewName}
                    </TabsTrigger>
                  ),
                )}
              </TabsList>
            </Tabs>
            <WorkbenchTable
              dataset={state.eventDataset}
              columns={eventColumns}
              page={state.eventPage}
              loading={state.datasetLoading.events}
              onPageChange={(page: number): void => {
                void state.changeEventPage(page);
              }}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const WorkbenchPage: React.FC = () => {
  const state: WorkbenchDataState = useWorkbenchData();
  const upcomingCount: number = state.calendar?.events.length ?? 0;

  if (state.loading && !state.data) {
    return <WorkbenchSkeleton />;
  }

  return (
    <main className="min-h-screen bg-muted/40 p-4 md:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-background p-5 shadow-sm md:p-7">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <BriefcaseBusiness className="size-7 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                OfferLoop 求职工作台
              </h1>
              <Badge variant="outline">按需读取飞书 Base 与日历</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              今天是 {dayjs().format('YYYY 年 M 月 D 日')} · 未来 7 天共有 {upcomingCount} 项安排
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void state.loadWorkbench();
              void state.loadCalendar();
            }}
            disabled={state.loading || state.calendarLoading}
            data-ai-section-type="button"
          >
            <RefreshCw className={state.loading ? 'animate-spin' : ''} />
            刷新数据
          </Button>
        </header>

        {state.error ? (
          <Alert variant="destructive">
            <AlertTitle>数据加载失败</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <WorkbenchCalendar
            calendar={state.calendar}
            calendarSourceUrl={state.data?.calendarSourceUrl ?? ''}
            loading={state.calendarLoading}
          />
          <TrainingCard />
        </section>

        <WorkbenchDataCard state={state} />
      </div>
    </main>
  );
};

export default WorkbenchPage;
