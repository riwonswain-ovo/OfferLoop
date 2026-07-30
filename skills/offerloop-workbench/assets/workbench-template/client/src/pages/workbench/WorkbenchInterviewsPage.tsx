import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  PlayCircle,
  RefreshCw,
  Star,
} from 'lucide-react';

import {
  getWorkbenchDataset,
  getWorkbenchInterviews,
} from '@client/src/api';
import { Button } from '@client/src/components/ui/button';
import { Skeleton } from '@client/src/components/ui/skeleton';
import {
  buildCodexTaskUrl,
  buildOfferLoopPrompt,
} from '@client/src/lib/codex-task';
import type {
  BaseCellValue,
  WorkbenchDataset,
  WorkbenchInterviewsResponse,
  WorkbenchRecord,
  WorkbenchWikiDirectoryResponse,
  WorkbenchWikiNode,
} from '@shared/api.interface';

import { cellToText } from './WorkbenchDatasetView';

const toDate = (value: BaseCellValue | undefined): Dayjs | null => {
  const text: string = cellToText(value).trim();
  if (!text) return null;
  const numeric: number = Number(text);
  const parsed: Dayjs = Number.isFinite(numeric) ? dayjs(numeric) : dayjs(text);
  return parsed.isValid() ? parsed : null;
};

const hasValue = (
  record: WorkbenchRecord | undefined,
  fieldName: string,
): boolean => Boolean(record && cellToText(record.fields[fieldName]).trim());

const openUrl = (value: BaseCellValue | undefined): void => {
  const url: string = cellToText(value).trim();
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

const collectMockDocuments = (
  nodes: WorkbenchWikiNode[],
  insideMockSection = false,
): WorkbenchWikiNode[] => nodes.flatMap((node: WorkbenchWikiNode) => {
  const inMockSection: boolean =
    insideMockSection || node.title.includes('模拟面试');
  const current: WorkbenchWikiNode[] =
    inMockSection
    && node.objectType === 'docx'
    && !node.hasChildren
    && node.children.length === 0
    && node.title.trim() !== '06｜模拟面试'
    && node.title.trim() !== '07｜模拟面试'
      ? [node]
      : [];
  return [
    ...current,
    ...collectMockDocuments(node.children, inMockSection),
  ];
});

interface WorkbenchInterviewsPageProps {
  directory: WorkbenchWikiDirectoryResponse | null;
  onNodeSelect: (node: WorkbenchWikiNode) => void;
}

const WorkbenchInterviewsPage: React.FC<WorkbenchInterviewsPageProps> = ({
  directory,
  onNodeSelect,
}) => {
  const [data, setData] = useState<WorkbenchInterviewsResponse | null>(null);
  const [linkedProgress, setLinkedProgress] =
    useState<WorkbenchDataset | null>(null);
  const [reviewType, setReviewType] = useState<'real' | 'mock'>('real');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      setData(await getWorkbenchInterviews());
    } catch {
      setError('暂时无法读取笔面试中心，请检查飞书应用授权后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const records: WorkbenchRecord[] = data?.events.records ?? [];
  const nowValue: number = dayjs().valueOf();
  const weekEndValue: number = dayjs(nowValue).add(7, 'day').endOf('day').valueOf();
  const upcoming: WorkbenchRecord[] = useMemo(
    () => records
      .filter((record: WorkbenchRecord): boolean => {
        const date: Dayjs | null = toDate(record.fields['开始时间']);
        const timestamp: number = date?.valueOf() ?? 0;
        return timestamp > nowValue && timestamp < weekEndValue;
      })
      .sort((left: WorkbenchRecord, right: WorkbenchRecord): number =>
        (toDate(left.fields['开始时间'])?.valueOf() ?? 0)
        - (toDate(right.fields['开始时间'])?.valueOf() ?? 0)),
    [data, nowValue, weekEndValue],
  );
  const nextInterview: WorkbenchRecord | undefined = upcoming[0];
  const mockDocuments: WorkbenchWikiNode[] = useMemo(
    () => collectMockDocuments(directory?.nodes ?? []).slice(0, 8),
    [directory],
  );

  useEffect(() => {
    if (!nextInterview) {
      setLinkedProgress(null);
      return;
    }
    const company: string = cellToText(nextInterview.fields['公司']).trim();
    const role: string = cellToText(nextInterview.fields['岗位']).trim();
    if (!company) return;
    void getWorkbenchDataset({
      source: 'progress',
      filters: { 公司: company, ...(role ? { 投递岗位: role } : {}) },
    }).then(setLinkedProgress).catch(() => setLinkedProgress(null));
  }, [nextInterview?.recordId]);

  if (loading) {
    return (
      <main className="space-y-4 p-5">
        <Skeleton className="h-12 w-52" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-[520px] w-full" />
      </main>
    );
  }

  const needsPreparation: number = upcoming.filter(
    (record: WorkbenchRecord): boolean =>
      !hasValue(record, '面试准备文档'),
  ).length;
  const prepared: number = upcoming.length - needsPreparation;
  const needsReview: number = records.filter((record: WorkbenchRecord): boolean => {
    const date: Dayjs | null = toDate(record.fields['开始时间']);
    return Boolean(
      date
      && date.valueOf() < nowValue
      && !hasValue(record, '面试复盘文档'),
    );
  }).length;
  const reviews: WorkbenchRecord[] = records
    .filter((record: WorkbenchRecord): boolean =>
      hasValue(record, '面试复盘文档'))
    .slice(0, 8);
  const nextProgress: WorkbenchRecord | undefined = linkedProgress?.records[0];
  const nextCompany: string = nextInterview
    ? cellToText(nextInterview.fields['公司']).trim() || '公司待确认'
    : '公司待确认';
  const nextRole: string = nextInterview
    ? cellToText(nextInterview.fields['岗位']).trim() || '岗位待确认'
    : '岗位待确认';
  const nextStage: string = nextInterview
    ? cellToText(nextInterview.fields['环节']).trim() || '环节待确认'
    : '环节待确认';
  const metrics = [
    { label: '未来 7 天', value: upcoming.length, icon: CalendarDays },
    { label: '待准备', value: needsPreparation, icon: Clock3 },
    { label: '已准备', value: prepared, icon: CheckCircle2 },
    { label: '待复盘', value: needsReview, icon: FileCheck2 },
    { label: 'Offer', value: data?.offerCount ?? 0, icon: Star },
  ];
  const mockPrompt: string = nextInterview
    ? `请基于 ${nextCompany} 的 ${nextRole} 开始一场模拟面试。`
      + '请先确认使用的简历、岗位 JD、面试模式和时长，再逐题进行。'
    : '请开始一场模拟面试。先让我确认目标岗位、使用的简历、'
      + '完整模拟或逐题训练模式和时长，再逐题进行。';

  return (
    <main className="h-[calc(100vh-50px)] overflow-hidden bg-[#F5F6F7] p-3 lg:p-4">
      <div className="mx-auto flex h-full max-w-[1320px] min-h-0 flex-col gap-3">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">面试与复盘</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              左侧查看即将开始与模拟面试；右侧完成下一次准备和统一复盘。
            </p>
          </div>
          <div className="flex gap-2">
            {data?.events.sourceUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={data.events.sourceUrl} target="_blank" rel="noreferrer">
                  打开笔面试 Base <ExternalLink />
                </a>
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void load()}>
              刷新数据 <RefreshCw />
            </Button>
          </div>
        </header>

        {error ? (
          <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {error}
          </div>
        ) : null}

        <section className="grid shrink-0 grid-cols-2 overflow-hidden rounded-xl border bg-background md:grid-cols-5">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="border-b border-r px-4 py-3 last:border-r-0 md:border-b-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-4 w-4 text-blue-600" /> {label}
              </div>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="grid min-h-0 grid-rows-2 gap-3">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background p-4">
              <div className="flex shrink-0 items-center justify-between">
                <h2 className="text-base font-semibold">即将开始</h2>
                <span className="text-xs text-muted-foreground">未来 7 天</span>
              </div>
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                {upcoming.map((record: WorkbenchRecord) => {
                  const date: Dayjs | null = toDate(record.fields['开始时间']);
                  const company: string =
                    cellToText(record.fields['公司']) || '公司待确认';
                  const role: string =
                    cellToText(record.fields['岗位']) || '岗位待确认';
                  const stage: string =
                    cellToText(record.fields['环节']) || '待确认';
                  return (
                    <div key={record.recordId} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {company} · {role}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {date ? date.format('MM/DD HH:mm') : '时间待确认'} · {stage}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <a href={buildCodexTaskUrl(buildOfferLoopPrompt(
                          'interview-prep',
                          `请为 ${company} 的 ${role} ${stage} 准备面试。`
                          + '请结合岗位 JD、当前简历和已有材料，确认后再写入飞书。',
                        ))}>
                          准备面试
                        </a>
                      </Button>
                    </div>
                  );
                })}
                {upcoming.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">
                    未来 7 天暂无笔面试安排
                  </p>
                ) : null}
              </div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background p-4">
              <div className="flex shrink-0 items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">模拟面试 · Mock Lab</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    最近模拟产物来自飞书知识库
                  </p>
                </div>
                <Button asChild size="sm">
                  <a href={buildCodexTaskUrl(buildOfferLoopPrompt('mock-lab', mockPrompt))}>
                    <PlayCircle /> 开始新的模拟
                  </a>
                </Button>
              </div>
              <div className="mt-3 grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
                {mockDocuments.map((node: WorkbenchWikiNode) => (
                  <button
                    key={node.nodeToken}
                    type="button"
                    onClick={() => onNodeSelect(node)}
                    className="rounded-lg border p-3 text-left hover:border-blue-200 hover:bg-blue-50/30"
                  >
                    <p className="truncate text-xs font-medium">{node.title}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      打开模拟记录
                    </p>
                  </button>
                ))}
                {mockDocuments.length === 0 ? (
                  <p className="col-span-full py-10 text-center text-xs text-muted-foreground">
                    暂无模拟面试记录，点击右上角开始第一场
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <aside className="grid min-h-0 grid-rows-2 gap-3">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background p-4">
              <h2 className="shrink-0 text-base font-semibold">下一次面试准备</h2>
              {nextInterview ? (
                <>
                  <p className="mt-3 shrink-0 text-sm font-medium">
                    {nextCompany} · {nextRole} · {nextStage}
                  </p>
                  <div className="my-3 min-h-0 flex-1 space-y-2 overflow-auto text-xs">
                    {[
                      ['岗位 JD', hasValue(nextProgress, '岗位 JD')],
                      ['投递简历版本', hasValue(nextInterview, '投递简历版本')],
                      ['面试准备文档', hasValue(nextInterview, '面试准备文档')],
                    ].map(([label, ready]) => (
                      <div key={String(label)} className="flex items-center justify-between rounded-lg border p-3">
                        <span>{label}</span>
                        <span className={ready ? 'text-emerald-600' : 'text-amber-600'}>
                          {ready ? '已就绪' : '待补充'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button asChild className="w-full shrink-0">
                    <a href={buildCodexTaskUrl(buildOfferLoopPrompt(
                      'interview-prep',
                      `请为 ${nextCompany} 的 ${nextRole} ${nextStage} 准备下一场面试。`
                      + '请结合岗位 JD、当前简历和已有材料，先让我确认后再写入飞书。',
                    ))}>
                      <FileText /> 生成面试准备文档
                    </a>
                  </Button>
                </>
              ) : (
                <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                  暂无需要准备的面试
                </p>
              )}
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background p-4">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">面试复盘</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    真实面试与模拟面试统一管理
                  </p>
                </div>
                <div className="flex rounded-lg bg-muted p-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setReviewType('real')}
                    className={reviewType === 'real' ? 'rounded bg-white px-2 py-1 shadow-sm' : 'px-2 py-1'}
                  >
                    真实
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewType('mock')}
                    className={reviewType === 'mock' ? 'rounded bg-white px-2 py-1 shadow-sm' : 'px-2 py-1'}
                  >
                    模拟
                  </button>
                </div>
              </div>
              <div className="my-3 min-h-0 flex-1 space-y-2 overflow-auto">
                {reviewType === 'real'
                  ? reviews.map((record: WorkbenchRecord) => (
                    <button
                      key={record.recordId}
                      type="button"
                      onClick={() => openUrl(record.fields['面试复盘文档'])}
                      className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:border-blue-200"
                    >
                      <span className="min-w-0 truncate text-xs">
                        {cellToText(record.fields['公司'])} · {cellToText(record.fields['岗位'])}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    </button>
                  ))
                  : mockDocuments.map((node: WorkbenchWikiNode) => (
                    <button
                      key={node.nodeToken}
                      type="button"
                      onClick={() => onNodeSelect(node)}
                      className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:border-blue-200"
                    >
                      <span className="min-w-0 truncate text-xs">{node.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    </button>
                  ))}
                {reviewType === 'real' && reviews.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    当前页暂无已关联的真实面试复盘
                  </p>
                ) : null}
                {reviewType === 'mock' && mockDocuments.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    暂无模拟面试记录
                  </p>
                ) : null}
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2">
                <Button asChild variant="outline">
                  <a href={buildCodexTaskUrl(buildOfferLoopPrompt(
                    'mock-lab',
                    '请复盘最近一场模拟面试。先让我确认对应的模拟记录，'
                    + '再按表现、问题和行动项完成复盘。',
                  ))}>
                    复盘模拟面试
                  </a>
                </Button>
                <Button asChild>
                  <a href={buildCodexTaskUrl(buildOfferLoopPrompt(
                    'talk-review',
                    '我想复盘一场真实面试。请先让我确认对应的 ASR、'
                    + '简历和岗位材料，再生成复盘文档。',
                  ))}>
                    复盘真实面试
                  </a>
                </Button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
};

export { WorkbenchInterviewsPage };
