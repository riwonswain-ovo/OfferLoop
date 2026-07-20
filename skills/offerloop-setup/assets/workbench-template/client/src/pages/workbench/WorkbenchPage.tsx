import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ExternalLink,
  FileSearch,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import type {
  BaseCellValue,
  WorkbenchDataset,
  WorkbenchRecord,
  WorkbenchResponse,
  WorkbenchTableDataset,
  WorkbenchViewDataset,
} from '@shared/api.interface';

import { extractLinkTargets } from './link-value';

import { getWorkbench } from '@client/src/api';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';

interface DatasetColumn {
  key: string;
  label: string;
  width?: string;
}

interface CalendarDay {
  date: Dayjs;
  events: WorkbenchRecord[];
}

const COMPANY_COLUMNS: DatasetColumn[] = [
  { key: '投递进度', label: '进度' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '招聘批次', label: '批次' },
  { key: '招聘项目', label: '招聘项目', width: 'min-w-40' },
  { key: '招聘岗位', label: '招聘岗位', width: 'min-w-52' },
  { key: '城市', label: '城市' },
  { key: '企业性质', label: '企业性质' },
  { key: '投递截止时间', label: '截止时间' },
  { key: '投递链接', label: '投递入口' },
];

const PROGRESS_COLUMNS: DatasetColumn[] = [
  { key: '当前阶段', label: '当前阶段' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '投递岗位', label: '投递岗位', width: 'min-w-48' },
  { key: '投递日期', label: '投递日期' },
  { key: '岗位 JD', label: '岗位 JD', width: 'min-w-64' },
  { key: '原招聘信息', label: '招聘信息' },
];

const EVENT_COLUMNS: DatasetColumn[] = [
  { key: '环节', label: '环节' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '岗位', label: '岗位', width: 'min-w-44' },
  { key: '开始时间', label: '开始时间' },
  { key: '截止时间', label: '截止时间' },
  { key: '完成状态', label: '状态' },
  { key: '链接', label: '入口' },
  { key: '面试准备文档', label: '准备文档' },
  { key: '面试复盘文档', label: '复盘文档' },
];

const EXAM_COLUMNS: DatasetColumn[] = [
  { key: '完成状态', label: '状态' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '岗位', label: '岗位', width: 'min-w-44' },
  { key: '笔试类型', label: '笔试类型' },
  { key: '笔试子类型', label: '形式' },
  { key: '开始时间', label: '开始时间' },
  { key: '截止时间', label: '截止时间' },
  { key: '链接', label: '入口' },
];

const INTERVIEW_COLUMNS: DatasetColumn[] = [
  { key: '完成状态', label: '状态' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '岗位', label: '岗位', width: 'min-w-44' },
  { key: '开始时间', label: '开始时间' },
  { key: '截止时间', label: '截止时间' },
  { key: '链接', label: '入口' },
  { key: '面试准备文档', label: '准备文档' },
  { key: '面试复盘文档', label: '复盘文档' },
];

const PROGRESS_STAGE_ORDER: string[] = [
  '已投递',
  '笔试',
  '群面',
  '一面',
  '二面',
  '三面',
  'HR面',
  'Offer',
  '已结束',
];

const LINK_FIELDS: string[] = [
  '公告链接',
  '投递链接',
  '原招聘信息',
  '链接',
  '面试准备文档',
  '面试复盘文档',
];

const DATE_FIELDS: string[] = [
  '信息更新时间',
  '投递日期',
  '开始时间',
  '结束时间',
  '截止时间',
];

const cellToText = (value: BaseCellValue | undefined): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  if (Array.isArray(value)) {
    return value.map((item: BaseCellValue): string => cellToText(item)).join('、');
  }
  const preferredValue: BaseCellValue | undefined =
    value.text ?? value.name ?? value.link ?? value.url;
  if (preferredValue !== undefined) {
    return cellToText(preferredValue);
  }
  return Object.values(value)
    .map((item: BaseCellValue): string => cellToText(item))
    .filter((item: string): boolean => Boolean(item))
    .join('、');
};

const cellToDate = (value: BaseCellValue | undefined): Dayjs | null => {
  if (typeof value === 'number') {
    const parsed: Dayjs = dayjs(value);
    return parsed.isValid() ? parsed : null;
  }
  const text: string = cellToText(value).trim();
  if (!text) {
    return null;
  }
  const numericValue: number = Number(text);
  const parsed: Dayjs = Number.isFinite(numericValue) && text.length >= 10
    ? dayjs(numericValue)
    : dayjs(text);
  return parsed.isValid() ? parsed : null;
};

const cellToDisplayText = (
  fieldName: string,
  value: BaseCellValue | undefined,
): string => {
  if (!DATE_FIELDS.includes(fieldName)) {
    return cellToText(value);
  }
  const parsed: Dayjs | null = cellToDate(value);
  if (!parsed) {
    return cellToText(value);
  }
  const hasTime: boolean = parsed.hour() !== 0
    || parsed.minute() !== 0
    || parsed.second() !== 0;
  return parsed.format(hasTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD');
};

const eventDate = (record: WorkbenchRecord): Dayjs | null => {
  return cellToDate(record.fields['开始时间'])
    ?? cellToDate(record.fields['截止时间']);
};

const WorkbenchTable: React.FC<{
  dataset: WorkbenchDataset;
  columns: DatasetColumn[];
}> = ({ dataset, columns }) => {
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column: DatasetColumn) => (
              <TableHead key={column.key} className={column.width}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dataset.records.map((record: WorkbenchRecord) => (
            <TableRow key={record.recordId}>
              {columns.map((column: DatasetColumn) => {
                const value: BaseCellValue | undefined = record.fields[column.key];
                const text: string = cellToDisplayText(
                  column.key,
                  value,
                );
                const isLink: boolean = LINK_FIELDS.includes(column.key);
                const linkTargets: string[] = isLink
                  ? extractLinkTargets(value)
                  : [];
                const isBadge: boolean = [
                  '投递进度',
                  '当前阶段',
                  '环节',
                  '完成状态',
                ].includes(column.key);
                return (
                  <TableCell
                    key={`${record.recordId}-${column.key}`}
                    className={`${column.width ?? ''} max-w-72`}
                  >
                    {linkTargets.length > 0 ? (
                      <span className="flex flex-wrap gap-2">
                        {linkTargets.map((target: string, index: number) => (
                          <a
                            key={target}
                            href={target}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {linkTargets.length > 1 ? `打开 ${index + 1}` : '打开'}
                            <ExternalLink className="size-3.5" />
                          </a>
                        ))}
                      </span>
                    ) : isBadge && text ? (
                      <Badge variant="secondary">{text}</Badge>
                    ) : (
                      <span className="block truncate" title={text}>
                        {text || '—'}
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="text-sm text-muted-foreground">
        当前展示 {dataset.records.length} 条，共 {dataset.total} 条
      </div>
    </div>
  );
};

const ProgressKanban: React.FC<{ dataset: WorkbenchDataset }> = ({ dataset }) => {
  const groupedRecords: Map<string, WorkbenchRecord[]> = new Map();
  dataset.records.forEach((record: WorkbenchRecord) => {
    const stage: string = cellToText(record.fields['当前阶段']) || '待确认';
    groupedRecords.set(stage, [...(groupedRecords.get(stage) ?? []), record]);
  });
  const stages: string[] = [
    ...PROGRESS_STAGE_ORDER.filter((stage: string): boolean => groupedRecords.has(stage)),
    ...Array.from(groupedRecords.keys()).filter(
      (stage: string): boolean => !PROGRESS_STAGE_ORDER.includes(stage),
    ),
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-4 overflow-x-auto pb-2">
        {stages.map((stage: string) => {
          const records: WorkbenchRecord[] = groupedRecords.get(stage) ?? [];
          return (
            <div key={stage} className="w-72 shrink-0 rounded-xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <Badge variant="secondary">{stage}</Badge>
                <span className="text-sm text-muted-foreground">{records.length}</span>
              </div>
              <div className="space-y-2">
                {records.map((record: WorkbenchRecord) => {
                  const company: string = cellToText(record.fields['公司']);
                  const position: string = cellToText(record.fields['投递岗位']);
                  const appliedAt: string = cellToDisplayText(
                    '投递日期',
                    record.fields['投递日期'],
                  );
                  return (
                    <div key={record.recordId} className="rounded-lg border bg-background p-3 shadow-sm">
                      <p className="font-medium">{company || '未命名公司'}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {position || '投递岗位待填写'}
                      </p>
                      {appliedAt ? (
                        <p className="mt-2 text-xs text-muted-foreground">投递于 {appliedAt}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-sm text-muted-foreground">
        当前展示 {dataset.records.length} 条，共 {dataset.total} 条
      </div>
    </div>
  );
};

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

const WorkbenchPage: React.FC = () => {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [selectedDataset, setSelectedDataset] = useState<string>('companies');
  const [selectedCompanyView, setSelectedCompanyView] = useState<string>('');
  const [selectedProgressView, setSelectedProgressView] = useState<string>('');
  const [selectedEventTable, setSelectedEventTable] = useState<string>('');

  const loadWorkbench = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const response: WorkbenchResponse = await getWorkbench();
      setData(response);
    } catch (_error: unknown) {
      setError('暂时无法读取飞书 Base，请稍后重试或检查应用授权。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, []);

  const calendarDays: CalendarDay[] = useMemo(() => {
    const start: Dayjs = dayjs().startOf('day');
    return Array.from({ length: 7 }, (_value: unknown, index: number) => {
      const date: Dayjs = start.add(index, 'day');
      const events: WorkbenchRecord[] = (data?.events.records ?? []).filter(
        (record: WorkbenchRecord): boolean => {
          const dateValue: Dayjs | null = eventDate(record);
          return Boolean(dateValue?.isSame(date, 'day'));
        },
      );
      return { date, events };
    });
  }, [data]);

  const upcomingCount: number = calendarDays.reduce(
    (total: number, day: CalendarDay): number => total + day.events.length,
    0,
  );

  const activeCompanyView: WorkbenchViewDataset | undefined =
    data?.companyViews.find(
      (view: WorkbenchViewDataset): boolean => view.viewId === selectedCompanyView,
    ) ?? data?.companyViews[0];
  const activeProgressView: WorkbenchViewDataset | undefined =
    data?.progressViews.find(
      (view: WorkbenchViewDataset): boolean => view.viewId === selectedProgressView,
    ) ?? data?.progressViews[0];
  const activeEventTable: WorkbenchTableDataset | undefined =
    data?.eventTables.find(
      (table: WorkbenchTableDataset): boolean => table.tableId === selectedEventTable,
    ) ?? data?.eventTables[0];

  const selectedDatasetUrl: string = selectedDataset === 'progress'
    ? activeProgressView?.sourceUrl ?? data?.progress.sourceUrl ?? ''
    : selectedDataset === 'events'
      ? activeEventTable?.sourceUrl ?? data?.events.sourceUrl ?? ''
      : activeCompanyView?.sourceUrl ?? data?.companies.sourceUrl ?? '';

  if (loading && !data) {
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
              <Badge variant="outline">实时读取飞书 Base</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              今天是 {dayjs().format('YYYY 年 M 月 D 日')} · 未来 7 天共有 {upcomingCount} 项安排
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadWorkbench()}
            disabled={loading}
            data-ai-section-type="button"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            刷新数据
          </Button>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>数据加载失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <CalendarDays className="size-5 text-primary" />
                    未来 7 天笔试与面试
                  </CardTitle>
                  <CardDescription>
                    来自笔面试中心，按开始时间或截止时间展示
                  </CardDescription>
                </div>
                {data ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={data.calendarSourceUrl} target="_blank" rel="noreferrer">
                      打开日历 Base
                      <ExternalLink />
                    </a>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid min-h-[300px] grid-cols-1 overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-7">
                {calendarDays.map((day: CalendarDay) => (
                  <div
                    key={day.date.format('YYYY-MM-DD')}
                    className="min-h-40 border-b p-3 last:border-b-0 sm:border-r lg:border-b-0"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2 lg:block">
                      <p className="text-xs text-muted-foreground">
                        {day.date.format('ddd')}
                      </p>
                      <p className={`text-lg font-semibold ${day.date.isSame(dayjs(), 'day') ? 'text-primary' : ''}`}>
                        {day.date.format('M/D')}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {day.events.length === 0 ? (
                        <p className="pt-3 text-xs text-muted-foreground">暂无安排</p>
                      ) : (
                        day.events.map((event: WorkbenchRecord) => (
                          <div
                            key={event.recordId}
                            className="rounded-lg border-l-4 border-l-primary bg-accent p-2"
                          >
                            <p className="truncate text-sm font-medium">
                              {cellToText(event.fields['公司']) || '未命名公司'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {cellToText(event.fields['环节']) || '待确认环节'}
                              {' · '}
                              {eventDate(event)?.format('HH:mm') ?? '时间待定'}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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
        </section>

        {data ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="text-xl">业务数据</CardTitle>
                  <CardDescription>
                    每个视图最多展示 30 条；需要编辑时进入原 Base
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={selectedDatasetUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开完整 Base
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs
                value={selectedDataset}
                onValueChange={setSelectedDataset}
              >
                <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
                  <TabsTrigger value="companies">
                    求职企业清单 · {data.companies.total}
                  </TabsTrigger>
                  <TabsTrigger value="progress">
                    求职进展 · {data.progress.total}
                  </TabsTrigger>
                  <TabsTrigger value="events">
                    笔面试中心 · {data.events.total}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="companies">
                  <Tabs
                    value={activeCompanyView?.viewId ?? ''}
                    onValueChange={setSelectedCompanyView}
                  >
                    <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60">
                      {data.companyViews.map((view: WorkbenchViewDataset) => (
                        <TabsTrigger key={view.viewId} value={view.viewId}>
                          {view.viewName} · {view.total}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {data.companyViews.map((view: WorkbenchViewDataset) => (
                      <TabsContent key={view.viewId} value={view.viewId}>
                        <WorkbenchTable dataset={view} columns={COMPANY_COLUMNS} />
                      </TabsContent>
                    ))}
                  </Tabs>
                </TabsContent>
                <TabsContent value="progress">
                  <Tabs
                    value={activeProgressView?.viewId ?? ''}
                    onValueChange={setSelectedProgressView}
                  >
                    <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60">
                      {data.progressViews.map((view: WorkbenchViewDataset) => (
                        <TabsTrigger key={view.viewId} value={view.viewId}>
                          {view.viewName} · {view.total}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {data.progressViews.map((view: WorkbenchViewDataset) => (
                      <TabsContent key={view.viewId} value={view.viewId}>
                        {view.viewType === 'kanban' ? (
                          <ProgressKanban dataset={view} />
                        ) : (
                          <WorkbenchTable dataset={view} columns={PROGRESS_COLUMNS} />
                        )}
                      </TabsContent>
                    ))}
                  </Tabs>
                </TabsContent>
                <TabsContent value="events">
                  <Tabs
                    value={activeEventTable?.tableId ?? ''}
                    onValueChange={setSelectedEventTable}
                  >
                    <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60">
                      {data.eventTables.map((table: WorkbenchTableDataset) => (
                        <TabsTrigger key={table.tableId} value={table.tableId}>
                          {table.tableName} · {table.total}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {data.eventTables.map((table: WorkbenchTableDataset) => (
                      <TabsContent key={table.tableId} value={table.tableId}>
                        <WorkbenchTable
                          dataset={table}
                          columns={table.tableName === '笔试'
                            ? EXAM_COLUMNS
                            : table.tableName === '全部安排'
                              ? EVENT_COLUMNS
                              : INTERVIEW_COLUMNS}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
};

export default WorkbenchPage;
