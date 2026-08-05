import React, { useEffect, useMemo, useRef, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Clock3,
  FileSearch,
  FileText,
  Link2,
  MailSearch,
  MessageSquareMore,
  RefreshCw,
  Search,
  Target,
} from 'lucide-react';

import {
  completeWorkbenchCalendarOAuth,
  getWorkbenchCalendar,
  getWorkbenchDataset,
  getWorkbenchHome,
  getWorkbenchHomeStageCounts,
  getWorkbenchInterviews,
} from '@client/src/api';
import { Skeleton } from '@client/src/components/ui/skeleton';
import {
  buildCodexTaskUrl,
  buildOfferLoopPrompt,
} from '@client/src/lib/codex-task';
import { cn } from '@client/src/lib/utils';
import type {
  WorkbenchCalendarResponse,
  WorkbenchDataset,
  WorkbenchHomeResponse,
  WorkbenchHomeStageCountsResponse,
  WorkbenchInterviewsResponse,
  WorkbenchRecord,
  WorkbenchStageCount,
} from '@shared/api.interface';

import {
  buildHomeTimelineDays,
  findUpcomingInterviews,
  getInterviewReadiness,
  parseRecordDate,
  readRecordText,
  summarizeHomeTimeline,
  type HomeReadinessCheck,
  type HomeScheduleSummary,
  type HomeTimelineDay,
} from './home-overview';
import {
  mergeHomeSchedule,
  type HomeScheduleItem,
} from './home-schedule';
import type { WorkbenchPageId } from './WorkbenchTopNav';
import { getWorkbenchOAuthRecoveryRoute } from './workbench-oauth';

interface WorkbenchHomeOverviewProps {
  onPageChange: (page: WorkbenchPageId) => void;
}

interface HomeCapability {
  title: string;
  description: string;
  icon: LucideIcon;
  page?: WorkbenchPageId;
  skill?: string;
  prompt?: string;
}

type InterviewsState = 'loading' | 'ready' | 'failed';

const HOME_CAPABILITIES: HomeCapability[] = [
  {
    title: '招聘同步',
    description: '同步 Base 中的招聘动态',
    icon: RefreshCw,
    skill: 'job-collection',
    prompt:
      '请同步我提供的招聘信息源。先读取现有求职企业清单并查重，'
      + '列出拟新增或更新的记录，写入飞书前让我确认。',
  },
  {
    title: '邮件扫描',
    description: '识别笔试、测评与面试通知',
    icon: MailSearch,
    skill: 'recruiting-reminder',
    prompt:
      '请检查我的招聘邮件，并先列出拟同步的笔面试安排，'
      + '写入飞书前让我确认。',
  },
  {
    title: '经历深挖',
    description: '连续追问并沉淀真实经历',
    icon: Search,
    skill: 'experience-deepthink',
    prompt:
      '我想开始一次经历深挖。请先让我自然讲述一段具体经历，'
      + '一次只追问一个问题，确认后再写入飞书知识库。',
  },
  {
    title: '简历制作',
    description: '结合岗位和已确认经历制作简历',
    icon: FileText,
    skill: 'resume-tailor',
    prompt:
      '我想针对目标岗位制作一份简历。请先让我确认岗位和选择经历，'
      + '生成前再次向我确认。',
  },
  {
    title: '面试准备',
    description: '结合 JD 与简历生成准备文档',
    icon: BookOpen,
    skill: 'interview-prep',
    prompt:
      '请帮我准备下一场面试。先让我确认目标公司、岗位、面试轮次、'
      + '岗位 JD 和使用的简历，再生成准备文档。',
  },
  {
    title: '模拟面试',
    description: '基于真实岗位进入 Mock Lab',
    icon: MessageSquareMore,
    skill: 'mock-lab',
    prompt:
      '请开始一场模拟面试。先让我确认目标岗位、使用的简历、'
      + '完整模拟或逐题训练模式和时长，再逐题进行。',
  },
  {
    title: '面试复盘',
    description: '关联 ASR 并沉淀复盘文档',
    icon: FileSearch,
    skill: 'talk-review',
    prompt:
      '我想开始一次面试复盘。请先让我选择真实面试或模拟面试，'
      + '再确认对应的 ASR、简历和岗位材料，确认后沉淀复盘文档。',
  },
  {
    title: 'PM Sense',
    description: '训练产品判断与结构化表达',
    icon: Target,
    skill: 'pm-sense',
    prompt:
      '请开始一次 PM Sense 训练。先让我从今日题目中选择一道，'
      + '不要提前给答案，等我独立作答后再逐轮追问。',
  },
];

const WorkbenchHomeOverview: React.FC<WorkbenchHomeOverviewProps> = ({
  onPageChange,
}) => {
  const [data, setData] = useState<WorkbenchHomeResponse | null>(null);
  const [calendar, setCalendar] =
    useState<WorkbenchCalendarResponse | null>(null);
  const [interviews, setInterviews] =
    useState<WorkbenchInterviewsResponse | null>(null);
  const [interviewsState, setInterviewsState] =
    useState<InterviewsState>('loading');
  const [linkedProgress, setLinkedProgress] =
    useState<WorkbenchDataset | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const oauthCompletionStartedRef = useRef<boolean>(false);
  const initialLoadStartedRef = useRef<boolean>(false);
  const loadSequenceRef = useRef<number>(0);

  const loadInterviews = async (): Promise<void> => {
    setInterviewsState('loading');
    try {
      setInterviews(await getWorkbenchInterviews());
      setInterviewsState('ready');
    } catch {
      // 横带优雅降级：接口失败时隐藏横带，不影响其他区块。
      setInterviews(null);
      setInterviewsState('failed');
    }
  };

  const load = async (): Promise<void> => {
    const sequence: number = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;
    setLoading(true);
    setError('');
    try {
      const home: WorkbenchHomeResponse = await getWorkbenchHome();
      if (loadSequenceRef.current !== sequence) {
        return;
      }
      setData(home);
    } catch {
      if (loadSequenceRef.current === sequence) {
        setError('工作台数据暂时无法读取，请检查飞书应用授权。');
      }
    } finally {
      if (loadSequenceRef.current === sequence) {
        setLoading(false);
      }
    }
    void getWorkbenchCalendar().catch(
      (): WorkbenchCalendarResponse => ({
        connected: false,
        events: [],
      }),
    ).then(
      (personalCalendar: WorkbenchCalendarResponse): void => {
        if (loadSequenceRef.current === sequence) {
          setCalendar(personalCalendar);
        }
      },
    );
    void getWorkbenchHomeStageCounts().catch(
      (): null => null,
    ).then(
      (result: WorkbenchHomeStageCountsResponse | null): void => {
        if (loadSequenceRef.current !== sequence || !result) {
          return;
        }
        setData(
          (current: WorkbenchHomeResponse | null): WorkbenchHomeResponse | null =>
            current
              ? { ...current, stageCounts: result.stageCounts }
              : current,
        );
      },
    );
  };

  useEffect(() => {
    const isOAuthCallback: boolean = window.location.pathname.endsWith(
      '/calendar-oauth-callback',
    );
    if (!isOAuthCallback) {
      if (initialLoadStartedRef.current) {
        return;
      }
      initialLoadStartedRef.current = true;
      void load();
      return;
    }
    if (oauthCompletionStartedRef.current) {
      return;
    }
    oauthCompletionStartedRef.current = true;
    const params: URLSearchParams = new URLSearchParams(window.location.search);
    const code: string = String(params.get('code') ?? '');
    const state: string = String(params.get('state') ?? '');
    const denied: boolean = params.get('error') === 'access_denied';
    const workbenchRoute: string = getWorkbenchOAuthRecoveryRoute(
      window.location.pathname,
      window.location.search,
    );
    const completeOAuth = async (): Promise<void> => {
      setLoading(true);
      setError('');
      try {
        const home: WorkbenchHomeResponse = await getWorkbenchHome();
        setData(home);
        if (denied) {
          setCalendar({
            connected: false,
            events: [],
            message: '你已取消个人日历授权，可稍后重新连接。',
          });
          return;
        }
        if (!code || !state) {
          setCalendar({
            connected: false,
            events: [],
            message: '个人日历授权回跳缺少必要参数，请重新连接。',
          });
          return;
        }
        const completion: { connected: boolean; message?: string } =
          await completeWorkbenchCalendarOAuth(code, state);
        if (!completion.connected) {
          setCalendar({
            connected: false,
            events: [],
            message: completion.message ?? '飞书个人日历授权失败',
          });
          return;
        }
        setCalendar(await getWorkbenchCalendar());
      } catch {
        setError('个人日历授权未能完成，请重新连接。');
        setCalendar({
          connected: false,
          events: [],
        });
      } finally {
        setLoading(false);
        window.location.replace(workbenchRoute);
      }
    };
    void completeOAuth();
  }, []);

  useEffect(() => {
    void loadInterviews();
  }, []);

  const now: Dayjs = dayjs();
  const upcomingInterviews: WorkbenchRecord[] = useMemo(
    () => findUpcomingInterviews(interviews?.events.records ?? [], dayjs()),
    [interviews],
  );
  const nextInterview: WorkbenchRecord | undefined = upcomingInterviews[0];
  const nextInterviewRecordId: string = nextInterview?.recordId ?? '';

  useEffect(() => {
    if (!nextInterview) {
      setLinkedProgress(null);
      return;
    }
    const company: string = readRecordText(nextInterview, '公司');
    const role: string = readRecordText(nextInterview, '岗位');
    if (!company) {
      return;
    }
    void getWorkbenchDataset({
      source: 'progress',
      filters: {
        公司: company,
        ...(role ? { 投递岗位: role } : {}),
      },
    }).then(setLinkedProgress).catch((): void => setLinkedProgress(null));
  }, [nextInterviewRecordId]);

  const stageCounts: Map<string, number> = useMemo(
    () => new Map(
      (data?.stageCounts ?? []).map(
        (item: WorkbenchStageCount): [string, number] => [
          item.stage,
          item.count,
        ],
      ),
    ),
    [data],
  );
  const interviewStageCount: number = [
    '群面',
    '一面',
    '二面',
    '三面',
    'HR面',
  ].reduce(
    (sum: number, stage: string): number =>
      sum + (stageCounts.get(stage) ?? 0),
    0,
  );
  const schedule: HomeScheduleItem[] = useMemo(
    () => mergeHomeSchedule(
      data?.upcomingEvents.records ?? [],
      calendar?.events ?? [],
    ),
    [calendar, data],
  );
  const timelineDays: HomeTimelineDay[] = useMemo(
    () => buildHomeTimelineDays(schedule, dayjs()),
    [schedule],
  );
  const summary: HomeScheduleSummary = useMemo(
    () => summarizeHomeTimeline(timelineDays),
    [timelineDays],
  );

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-50px)] bg-[#F5F6F7] p-3 lg:p-4">
        <div className="mx-auto max-w-[1320px] space-y-3.5">
          <div className="rounded-[10px] border border-blue-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm font-medium text-[#1F2329]">
              正在加载工作台数据…
            </p>
            <p className="mt-1 text-xs text-[#8F959E]">
              正在读取求职进展、笔面试安排和知识库目录
            </p>
          </div>
          <Skeleton className="h-[92px] rounded-[10px] bg-slate-200" />
          <div className="grid gap-3.5 lg:grid-cols-[55fr_45fr]">
            <Skeleton className="h-[430px] rounded-[10px] bg-slate-200" />
            <div className="space-y-3.5">
              <Skeleton className="h-[236px] rounded-[10px] bg-slate-200" />
              <Skeleton className="h-[236px] rounded-[10px] bg-slate-200" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  const metrics: Array<[string, number]> = [
    ['发现机会', data?.opportunityCount ?? 0],
    ['已投递', stageCounts.get('已投递') ?? 0],
    ['笔试中', stageCounts.get('笔试') ?? 0],
    ['面试中', interviewStageCount],
    ['Offer', stageCounts.get('Offer') ?? 0],
    ['已结束', stageCounts.get('已结束') ?? 0],
  ];
  const metricMax: number = Math.max(...metrics.map((row) => row[1]), 1);

  const nextDate: Dayjs | null = nextInterview
    ? parseRecordDate(nextInterview, '开始时间')
    : null;
  const nextCompany: string = nextInterview
    ? readRecordText(nextInterview, '公司') || '公司待确认'
    : '';
  const nextRole: string = nextInterview
    ? readRecordText(nextInterview, '岗位') || '岗位待确认'
    : '';
  const nextStage: string = nextInterview
    ? readRecordText(nextInterview, '环节') || '环节待确认'
    : '';
  const readiness: HomeReadinessCheck[] = nextInterview
    ? getInterviewReadiness(nextInterview, linkedProgress?.records[0])
    : [];

  return (
    <main className="min-h-[calc(100vh-50px)] bg-[#F5F6F7] p-3 lg:p-4">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-[0.2px] text-[#1F2329]">
              你好
            </h1>
            <p className="mt-0.5 text-[12.5px] text-[#8F959E]">
              专注执行每一步，离目标更近一点。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void load();
              void loadInterviews();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E5E6EB] bg-white px-3.5 text-[12.5px] text-[#1F2329] transition-colors hover:border-[#C9CDD4] hover:bg-[#FAFBFC]"
          >
            <RefreshCw
              className={cn(
                'size-3.5 text-[#646A73]',
                loading && 'animate-spin text-[#3370FF]',
              )}
            />
            刷新数据
          </button>
        </header>

        {error ? (
          <div className="mb-3.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {error}
          </div>
        ) : null}

        {interviewsState === 'loading' ? (
          <Skeleton className="mb-3.5 h-[92px] w-full rounded-[10px]" />
        ) : null}

        {interviewsState === 'ready' ? (
          nextInterview ? (
            <section
              className="relative mb-3.5 overflow-hidden rounded-[10px] px-5 py-4 text-white"
              style={{
                background:
                  'linear-gradient(115deg,#1D4FD7 0%,#2F6BFF 55%,#4A86FF 100%)',
                boxShadow: '0 8px 20px -10px rgba(36,91,219,.55)',
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -top-[90px] -right-[70px] size-[280px] rounded-full"
                style={{
                  background:
                    'radial-gradient(circle,rgba(255,255,255,.16),transparent 65%)',
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-[130px] right-[120px] size-[220px] rounded-full"
                style={{
                  background:
                    'radial-gradient(circle,rgba(255,255,255,.10),transparent 65%)',
                }}
              />
              <div className="relative z-[1] flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-white/[0.16] px-[9px] py-[3px] text-[11px] leading-none text-white">
                      下一步行动
                    </span>
                    {nextDate?.isSame(now, 'day') ? (
                      <span className="inline-flex items-center rounded-full bg-[#D97706] px-[9px] py-[3px] text-[11px] font-semibold leading-none text-white">
                        今天
                      </span>
                    ) : null}
                  </div>
                  <p className="text-lg font-semibold tracking-[0.3px]">
                    {nextCompany} · {nextRole} · {nextStage}
                  </p>
                  <p className="mt-[5px] flex items-center gap-1.5 text-[12.5px] text-white/85">
                    <Clock3 className="size-[13px]" />
                    {nextDate
                      ? `${nextDate.format('MM/DD')}（${
                        ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
                          nextDate.day()
                        ]
                      }）${nextDate.format('HH:mm')}`
                      : '时间待确认'}
                    {' · 近 7 天最近的一场面试'}
                  </p>
                </div>
                <div className="ml-auto flex flex-col items-end gap-2.5">
                  <div className="flex gap-1.5">
                    {readiness.map((check: HomeReadinessCheck) => (
                      <span
                        key={check.key}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11.5px]',
                          check.ready
                            ? 'bg-white/[0.14] text-white/90'
                            : 'bg-[#D97706]/95 text-white',
                        )}
                      >
                        {check.ready ? (
                          <Check className="size-[11px] text-[#7BE3A8]" />
                        ) : (
                          <CircleAlert className="size-[11px] text-[#FFD9A8]" />
                        )}
                        {check.ready ? check.label : `${check.label} · 待补充`}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={buildCodexTaskUrl(
                        buildOfferLoopPrompt(
                          'mock-lab',
                          `请基于 ${nextCompany} 的 ${nextRole}`
                          + ' 开始一场模拟面试。请先确认使用的简历、岗位 JD、'
                          + '面试模式和时长，再逐题进行。',
                        ),
                      )}
                      className="inline-flex h-[34px] items-center gap-1.5 rounded-md border border-white/55 px-4 text-[13px] text-white transition-colors hover:bg-white/[0.14]"
                    >
                      开始模拟面试
                    </a>
                    <a
                      href={buildCodexTaskUrl(
                        buildOfferLoopPrompt(
                          'interview-prep',
                          `请为 ${nextCompany} 的 ${nextRole} ${nextStage}`
                          + ' 准备下一场面试。请结合岗位 JD、当前简历和已有材料，'
                          + '先让我确认后再写入飞书。',
                        ),
                      )}
                      className="inline-flex h-[34px] items-center gap-1.5 rounded-md bg-white px-[18px] text-[13px] font-semibold text-[#245BDB] shadow-[0_2px_6px_rgba(0,0,0,.18)] transition-all hover:bg-[#F0F5FF]"
                    >
                      准备面试
                    </a>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section
              className="relative mb-3.5 overflow-hidden rounded-[10px] px-5 py-4 text-white"
              style={{
                background:
                  'linear-gradient(115deg,#1D4FD7 0%,#2F6BFF 55%,#4A86FF 100%)',
                boxShadow: '0 8px 20px -10px rgba(36,91,219,.55)',
              }}
            >
              <div className="relative z-[1] flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-white/[0.16] px-[9px] py-[3px] text-[11px] leading-none text-white">
                      下一步行动
                    </span>
                  </div>
                  <p className="text-lg font-semibold tracking-[0.3px]">
                    近 7 天暂无面试安排
                  </p>
                  <p className="mt-[5px] text-[12.5px] text-white/85">
                    新的笔试面试安排同步后，会显示在这里提醒你准备。
                  </p>
                </div>
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={() => onPageChange('interviews')}
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-md border border-white/55 px-4 text-[13px] text-white transition-colors hover:bg-white/[0.14]"
                  >
                    打开面试与复盘
                  </button>
                </div>
              </div>
            </section>
          )
        ) : null}

        <div className="grid items-stretch gap-3.5 lg:grid-cols-[55fr_45fr]">
          <section className="flex flex-col rounded-[10px] border border-[#E5E6EB] bg-white px-4 py-[13px]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#1F2329]">
                近 7 天 · 笔试与面试
              </h2>
              {calendar?.connected ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-[#16A34A]">
                  <i className="size-1.5 rounded-full bg-[#16A34A] shadow-[0_0_0_3px_rgba(22,163,74,.14)]" />
                  日历已连接
                </span>
              ) : null}
              {calendar && !calendar.connected && calendar.authorizationUrl ? (
                <a
                  href={calendar.authorizationUrl}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-xs text-[#3370FF] hover:underline"
                >
                  <Link2 className="size-3" />
                  连接飞书日历
                </a>
              ) : null}
              {calendar && !calendar.connected && !calendar.authorizationUrl ? (
                <span className="text-xs text-[#8F959E]">日历未连接</span>
              ) : null}
            </div>

            <div className="grid min-h-0 flex-1 grid-rows-7">
              {timelineDays.map((day: HomeTimelineDay, index: number) => (
                <div
                  key={day.key}
                  className="grid min-h-0 grid-cols-[50px_16px_1fr] gap-x-2"
                >
                  <div className="pt-1 text-right">
                    <b
                      className={cn(
                        'block text-[12.5px] font-semibold tabular-nums',
                        day.isToday ? 'text-[#3370FF]' : 'text-[#1F2329]',
                      )}
                    >
                      {day.dateLabel}
                    </b>
                    <span className="block text-[11px] text-[#8F959E]">
                      {day.weekdayLabel}
                    </span>
                    {day.isToday ? (
                      <i className="mt-[3px] inline-block rounded bg-[#3370FF] px-[5px] py-[3px] text-[10px] font-semibold not-italic leading-none text-white">
                        今天
                      </i>
                    ) : null}
                  </div>
                  <div className="relative flex justify-center">
                    <i
                      aria-hidden
                      className="absolute left-1/2 w-px -translate-x-1/2 bg-[#DFE2E6]"
                      style={{
                        top: index === 0 ? 15 : 0,
                        bottom: index === timelineDays.length - 1 ? 'auto' : 0,
                        height:
                          index === timelineDays.length - 1 ? 17 : undefined,
                      }}
                    />
                    <i
                      aria-hidden
                      className={cn(
                        'relative z-[1] rounded-full border-2 border-white',
                        day.isToday
                          ? 'mt-[9px] size-[11px] bg-[#3370FF] shadow-[0_0_0_3px_rgba(51,112,255,.20)]'
                          : 'mt-[11px] size-2 bg-[#C6CDD6]',
                      )}
                    />
                  </div>
                  <div className="min-h-0 min-w-0 overflow-y-auto">
                    {day.items.length > 0 ? (
                      day.items.map((item: HomeScheduleItem) => {
                        const itemDate: Dayjs = dayjs(item.startAt);
                        const [company, ...roleParts] = item.title.split(' · ');
                        const isExam: boolean = item.stage.includes('笔试');
                        const content = (
                          <>
                            <span className="w-[46px] flex-none text-sm font-semibold tabular-nums text-[#1F2329]">
                              {itemDate.isValid()
                                ? itemDate.format('HH:mm')
                                : '待定'}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] text-[#1F2329]">
                              <b className="font-semibold">{company}</b>
                              {roleParts.length > 0 ? (
                                <>
                                  <span className="mx-[5px] text-[#8F959E]">
                                    ·
                                  </span>
                                  {roleParts.join(' · ')}
                                </>
                              ) : null}
                            </span>
                            <span
                              className={cn(
                                'ml-auto flex-none rounded-full px-[9px] py-0.5 text-[11px] font-medium',
                                isExam
                                  ? 'bg-[#FDF0DC] text-[#D97706]'
                                  : 'bg-[#E8F1FF] text-[#3370FF]',
                              )}
                            >
                              {item.stage}
                            </span>
                          </>
                        );
                        const itemClassName = cn(
                          'my-[3px] flex min-h-[42px] items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
                          day.isToday
                            ? 'border-[#B9D0FF] bg-[#EBF2FF]'
                            : 'border-[#ECEEF0] bg-[#FAFBFC]',
                          item.url && 'hover:border-[#C7D8FF] hover:bg-[#F5F9FF]',
                        );
                        return item.url ? (
                          <a
                            key={item.key}
                            href={item.url}
                            target="_blank"
                            rel="noopener"
                            className={itemClassName}
                          >
                            {content}
                          </a>
                        ) : (
                          <div key={item.key} className={itemClassName}>
                            {content}
                          </div>
                        );
                      })
                    ) : (
                      <div className="my-[3px] flex h-[calc(100%-6px)] min-h-[42px] items-center rounded-lg border border-dashed border-[#E3E5E8] px-3 py-[9px] text-xs text-[#B0B6BF]">
                        空档 · 可安排准备与模拟
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-between border-t border-[#F0F1F2] pt-[9px] text-xs text-[#8F959E]">
              <span>
                {summary.total > 0
                  ? `共 ${summary.total} 场`
                    + (summary.interviews > 0 || summary.exams > 0
                      ? ` · 面试 ${summary.interviews} / 笔试 ${summary.exams}`
                      : '')
                    + (summary.calendarOnly > 0
                      ? ` · 个人日历 ${summary.calendarOnly}`
                      : '')
                  : '近 7 天暂无安排'}
              </span>
              <button
                type="button"
                onClick={() => onPageChange('interviews')}
                className="inline-flex items-center gap-1 text-[12.5px] text-[#3370FF] hover:underline"
              >
                打开面试与复盘
                <ArrowRight className="size-[13px]" />
              </button>
            </div>
          </section>

          <div className="flex min-w-0 flex-col gap-3.5">
            <section className="rounded-[10px] border border-[#E5E6EB] bg-white px-4 py-[13px]">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#1F2329]">
                  求职进展概览
                </h2>
                <span className="text-[11.5px] text-[#8F959E]">截至今天</span>
              </div>
              <div>
                {metrics.map(([label, value]: [string, number]) => (
                  <div
                    key={label}
                    className="grid h-7 grid-cols-[62px_34px_1fr] items-center gap-2.5"
                  >
                    <span className="text-[12.5px] text-[#646A73]">
                      {label}
                    </span>
                    <span className="text-right text-[13px] font-semibold tabular-nums text-[#1F2329]">
                      {value}
                    </span>
                    <div className="h-2 overflow-hidden rounded-full bg-[#EFF1F3]">
                      <div
                        className="h-full min-w-[5px] rounded-full"
                        style={{
                          width: `${Math.max(value / metricMax * 100, 1)}%`,
                          background:
                            'linear-gradient(90deg,#5B8CFF,#3370FF)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 border-t border-[#F0F1F2] pt-[9px]">
                <button
                  type="button"
                  onClick={() => onPageChange('applications')}
                  className="inline-flex items-center gap-1 text-[12.5px] text-[#3370FF] hover:underline"
                >
                  查看求职进展
                  <ArrowRight className="size-[13px]" />
                </button>
              </div>
            </section>

            <section className="flex-1 rounded-[10px] border border-[#E5E6EB] bg-white px-4 py-[13px]">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#1F2329]">
                  OfferLoop 能力
                </h2>
                <span className="text-[11.5px] text-[#8F959E]">8 项</span>
              </div>
              <div className="grid grid-cols-1 gap-x-2.5 gap-y-0.5 sm:grid-cols-2">
                {HOME_CAPABILITIES.map((capability: HomeCapability) => {
                  const Icon: LucideIcon = capability.icon;
                  const content = (
                    <>
                      <span className="flex size-[30px] flex-none items-center justify-center rounded-lg bg-[#EBF2FF] text-[#3370FF]">
                        <Icon className="size-[15px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-medium text-[#1F2329] group-hover:text-[#3370FF] group-hover:underline group-hover:underline-offset-[3px]">
                          {capability.title}
                        </span>
                        <span className="block truncate text-[11px] text-[#8F959E]">
                          {capability.description}
                        </span>
                      </span>
                    </>
                  );
                  const itemClassName =
                    'group flex min-w-0 items-center gap-[9px] rounded-[7px] px-2 py-[7px] text-left transition-colors hover:bg-[#F3F7FF]';
                  if (capability.skill && capability.prompt) {
                    return (
                      <a
                        key={capability.title}
                        href={buildCodexTaskUrl(
                          buildOfferLoopPrompt(
                            capability.skill,
                            capability.prompt,
                          ),
                        )}
                        className={itemClassName}
                      >
                        {content}
                      </a>
                    );
                  }
                  return (
                    <button
                      key={capability.title}
                      type="button"
                      onClick={() => {
                        if (capability.page) onPageChange(capability.page);
                      }}
                      className={itemClassName}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
};

export { WorkbenchHomeOverview };
