import React from 'react';
import dayjs from 'dayjs';
import {
  BellRing,
  Bot,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  Database,
  ExternalLink,
  FileSearch,
  FolderKanban,
  RefreshCw,
  Settings,
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

const SKILL_GROUPS = [
  {
    name: '求职基础能力',
    description: '配置、空间、岗位与笔面试安排',
    skills: [
      {
        name: 'offerloop-setup',
        title: '安装与配置',
        description: '首次配置、环境检查、飞书授权和完整部署',
        prompt: '介绍 OfferLoop 的十二个 Skill，并帮我完成第一次使用。',
        icon: Settings,
      },
      {
        name: 'offerloop-workspace',
        title: '求职空间',
        description: '管理必需的飞书知识库、三张 Base 和训练产物',
        prompt: '检查我的 OfferLoop 知识库是否完整。',
        icon: FolderKanban,
      },
      {
        name: 'job-collection',
        title: '招聘信息同步',
        description: '从指定信息源收集岗位并整理到企业清单',
        prompt: '同步我的招聘信息源。',
        icon: Database,
      },
      {
        name: 'recruiting-reminder',
        title: '笔试面试提醒',
        description: '从招聘邮件识别安排并同步笔面试中心和日历',
        prompt: '检查最近 7 天的笔试面试邮件，先不要写入。',
        icon: BellRing,
      },
      {
        name: 'offerloop-workbench',
        title: '可选工作台',
        description: '按需部署和维护飞书可视化工作台',
        prompt: '为我的 OfferLoop 搭建飞书工作台。',
        icon: ExternalLink,
      },
      {
        name: 'offerloop-agent',
        title: '可选 Codex Agent',
        description: '在已有工作台中加装本机 Codex 智能助手右侧栏',
        prompt: '把 Codex 接入我现有的 OfferLoop 工作台。',
        icon: Bot,
      },
    ],
  },
  {
    name: '求职训练能力',
    description: '素材沉淀、准备、练习与复盘',
    skills: [
      {
        name: 'experience-deepthink',
        title: '经历深挖',
        description: '从 Chat 经历讲述和岗位方向开始，持续维护口述稿、事实边界和故事素材',
        prompt: '我会直接讲一段竞赛经历，想用它准备财务分析岗，请开始深挖。',
        icon: FileSearch,
      },
      {
        name: 'resume-tailor',
        title: 'Resume Tailor',
        description: '按岗位组合用户选定的真实经历，补齐固定信息并生成一页 PDF 简历',
        prompt: '根据这个岗位和我选的三段经历，制作一页 PDF 简历。',
        icon: BriefcaseBusiness,
      },
      {
        name: 'pm-sense',
        title: '产品思维训练',
        description: '训练产品与场景题，完善口语回答',
        prompt: '让我先回答一道产品场景题，再帮我完善。',
        icon: BookOpen,
      },
      {
        name: 'interview-prep',
        title: '面试准备',
        description: '结合 JD、投递简历和素材生成针对性准备文档',
        prompt: '根据下一场面试和实际投递简历帮我准备。',
        icon: BriefcaseBusiness,
      },
      {
        name: 'mock-lab',
        title: '模拟面试',
        description: '按真实节奏一题一答，结束后统一点评',
        prompt: '用刚才的准备文档模拟面试。',
        icon: Sparkles,
      },
      {
        name: 'talk-review',
        title: '真实面试复盘',
        description: '根据 ASR 或转写还原问答并生成改进方案',
        prompt: '根据这份 ASR 复盘刚结束的面试。',
        icon: FileSearch,
      },
    ],
  },
] as const;

const SkillMapCard: React.FC = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-xl">
        <Sparkles className="size-5 text-primary" />
        OfferLoop 能力地图
      </CardTitle>
      <CardDescription>
        展开查看 12 个 Skill；无需记名称，直接对 Agent 描述目标即可
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {SKILL_GROUPS.map((group) => (
        <details
          key={group.name}
          className="group rounded-lg border bg-muted/20"
          open={group.name === '求职训练能力'}
        >
          <summary className="cursor-pointer list-none px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{group.name}</div>
                <div className="text-xs text-muted-foreground">
                  {group.description}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{group.skills.length} 个</Badge>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </div>
            </div>
          </summary>
          <div className="space-y-2 border-t p-3">
            {group.skills.map((skill) => {
              const Icon = skill.icon;
              return (
                <div
                  key={skill.name}
                  className="rounded-lg border bg-background px-3 py-3"
                >
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <Icon className="size-4 text-primary" />
                    {skill.title}
                    <span className="font-mono text-xs text-muted-foreground">
                      {skill.name}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {skill.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    可以说：“{skill.prompt}”
                  </p>
                </div>
              );
            })}
          </div>
        </details>
      ))}
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
          <SkillMapCard />
        </section>

        <WorkbenchDataCard state={state} />
      </div>
    </main>
  );
};

export default WorkbenchPage;
