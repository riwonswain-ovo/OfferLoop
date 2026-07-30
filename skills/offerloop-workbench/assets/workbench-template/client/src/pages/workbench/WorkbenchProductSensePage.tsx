import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  MessageSquareMore,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';

import {
  getProductSenseSession,
  saveProductSenseDraft,
  selectProductSenseQuestion,
  switchProductSenseQuestion,
} from '@client/src/api';
import { Button } from '@client/src/components/ui/button';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { Textarea } from '@client/src/components/ui/textarea';
import {
  buildCodexTaskUrl,
  buildOfferLoopPrompt,
} from '@client/src/lib/codex-task';
import { cn } from '@client/src/lib/utils';
import type {
  ProductSenseQuestion,
  ProductSenseSession,
} from '@shared/api.interface';

const WorkbenchProductSensePage: React.FC = () => {
  const [session, setSession] = useState<ProductSenseSession | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const applySession = (next: ProductSenseSession): void => {
    setSession(next);
    setDraft(next.draft);
  };

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      applySession(await getProductSenseSession());
    } catch {
      setError('暂时无法读取 PM Sense 训练会话。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectQuestion = async (
    question: ProductSenseQuestion,
  ): Promise<void> => {
    setSaving(true);
    try {
      applySession(await selectProductSenseQuestion({
        questionId: question.id,
      }));
    } catch {
      setError('题目暂时无法切换，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  const switchQuestion = async (): Promise<void> => {
    setSaving(true);
    try {
      applySession(await switchProductSenseQuestion({
        questionId: session?.question.id,
        reason: '不感兴趣',
        detail: '用户从工作台主动换一题',
      }));
    } catch {
      setError('当前题目暂时无法更换。');
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async (): Promise<void> => {
    if (!session) return;
    setSaving(true);
    try {
      applySession(await saveProductSenseDraft({
        draft,
        followupAnswers: session.followupAnswers,
        selfSummary: session.selfSummary,
        status: 'answering',
      }));
    } catch {
      setError('草稿保存失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="space-y-4 p-5">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-[520px] w-full" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="p-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">{error}</p>
          <Button className="mt-3" size="sm" onClick={() => void load()}>
            重新读取
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[calc(100vh-50px)] overflow-hidden bg-[#F5F6F7] p-3 lg:p-4">
      <div className="mx-auto flex h-full max-w-[1320px] min-h-0 flex-col gap-3">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">PM Sense</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              选题、独立作答，并在本机 Codex 中继续追问训练。
            </p>
          </div>
          <div className="flex gap-2">
            {session.lastArchiveUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={session.lastArchiveUrl} target="_blank" rel="noreferrer">
                  打开训练文档 <ExternalLink />
                </a>
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void load()}>
              刷新今日题目 <RefreshCw />
            </Button>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {error}
          </div>
        ) : null}

        <section className="shrink-0 rounded-xl border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-blue-600">今日三题</p>
              <p className="mt-1 text-xs text-muted-foreground">
                题目来自当前真实训练会话；选择后再开始作答。
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600">
              累计完成 {session.completedCount} 题
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {session.dailyQuestions.map((question: ProductSenseQuestion) => {
              const active: boolean = question.id === session.question.id;
              return (
                <button
                  key={question.id}
                  type="button"
                  disabled={saving}
                  onClick={() => void selectQuestion(question)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    active
                      ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-100'
                      : 'hover:border-blue-200',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-violet-50 px-2 py-1 text-[10px] text-violet-600">
                      {question.logicType}
                    </span>
                    {active ? <CheckCircle2 className="h-4 w-4 text-blue-600" /> : null}
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6">
                    {question.prompt}
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {question.company} · {question.scopeType}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.55fr)_330px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <h2 className="text-base font-semibold">当前训练题</h2>
                </div>
                <h3 className="mt-3 text-xl font-semibold leading-8">
                  {session.question.prompt}
                </h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  事实锚点：{session.question.factAnchor}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!session.canSwitch || saving}
                onClick={() => void switchQuestion()}
              >
                换一题
              </Button>
            </div>

            <div className="mt-5 flex min-h-0 flex-1 flex-col">
              <label className="text-xs font-medium">先写下你的独立判断</label>
              <Textarea
                value={draft}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDraft(event.target.value)}
                className="mt-2 min-h-32 flex-1 resize-none"
                placeholder="先独立作答，保留你的原始判断。"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => void saveDraft()}>
                {saving ? <LoaderCircle className="animate-spin" /> : <Send />}
                保存草稿
              </Button>
              <Button asChild>
                <a
                  href={buildCodexTaskUrl(
                    buildOfferLoopPrompt(
                      'pm-sense',
                      `请使用 PM Sense 训练流程与我完成这道题：\n`
                      + `${session.question.prompt}\n\n`
                      + `我的独立初答：${draft.trim()
                        || '我还没有作答，请先让我独立思考。'}\n\n`
                      + '不要提前给标准答案；请按原子化、归组、MECE 检查逐轮追问，'
                      + '完成后再让我确认归档到飞书知识库。',
                    ),
                  )}
                >
                  <MessageSquareMore /> 在 Codex 中继续追问
                </a>
              </Button>
            </div>
          </section>

          <aside className="grid min-h-0 grid-rows-[minmax(0,1.45fr)_minmax(0,0.55fr)] gap-3">
            <section className="min-h-0 overflow-auto rounded-xl border bg-background p-5">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-violet-600" />
                <h2 className="text-base font-semibold">训练流程</h2>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ['1', '阅读题目', '理解事实锚点与问题边界'],
                  ['2', '独立思考', '保留你的原始判断'],
                  ['3', '追问对话', 'Codex 一次只追问一个问题'],
                  ['4', '反馈校准', '检查原子化、归组与 MECE'],
                  ['5', '沉淀文档', '确认后写入飞书知识库'],
                ].map(([index, title, description], itemIndex: number) => (
                  <div key={index} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-medium text-blue-600">
                      {index}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {description}
                      </p>
                    </div>
                    {itemIndex < 4 ? (
                      <ArrowRight className="ml-auto h-4 w-4 text-slate-300" />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="min-h-0 overflow-auto rounded-xl border bg-background p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">训练概览</h2>
                <span className="text-[10px] text-muted-foreground">
                  当前真实会话
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ['累计完成', session.completedCount],
                  ['候选题池', session.poolSize],
                  ['训练进度', `${session.progress}%`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-slate-50 p-2 text-center">
                    <p className="text-base font-semibold text-blue-600">{value}</p>
                    <p className="mt-1 text-[9px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {session.preference.learnedSignals.length > 0
                  ? session.preference.learnedSignals.slice(0, 4).map((signal: string) => (
                    <span key={signal} className="rounded-full bg-violet-50 px-2 py-1 text-[9px] text-violet-600">
                      {signal}
                    </span>
                  ))
                  : (
                    <p className="text-[10px] leading-5 text-muted-foreground">
                      完成更多题目后，这里会显示你的选题偏好。
                    </p>
                  )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
};

export { WorkbenchProductSensePage };
