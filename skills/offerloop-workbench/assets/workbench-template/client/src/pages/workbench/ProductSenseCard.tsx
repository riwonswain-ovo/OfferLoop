import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  HeartOff,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  ProductSenseAutoCompleteResponse,
  ProductSenseDislikeReason,
  ProductSenseFeedbackInput,
  ProductSenseQuestion,
  ProductSenseSession,
} from '@shared/api.interface';
import {
  PM_SENSE_PARENT_URL,
} from '../../../../shared/product-sense-config';

import {
  autoCompleteProductSense,
  getProductSenseSession,
  saveProductSenseDraft,
  selectProductSenseQuestion,
  switchProductSenseQuestion,
} from '@client/src/api';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@client/src/components/ui/alert';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Label } from '@client/src/components/ui/label';
import { Progress } from '@client/src/components/ui/progress';
import {
  RadioGroup,
  RadioGroupItem,
} from '@client/src/components/ui/radio-group';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { Textarea } from '@client/src/components/ui/textarea';

const DISLIKE_REASONS: ProductSenseDislikeReason[] = [
  '范围太大',
  '前提模糊',
  '不感兴趣',
  '过于熟悉',
  '依赖行业知识',
  '其他原因',
];

const buildAgentTaskUrl = (session: ProductSenseSession): string => {
  const prompt: string = [
    '请使用 $competency-lab Skill 与我完成这道岗位能力训练。',
    '',
    `题目：${session.question.prompt}`,
    `公司：${session.question.company}`,
    `事实锚点：${session.question.factAnchor}`,
    `题目来源：${session.question.sourceLabel} ${session.question.sourceUrl}`,
    `工作台题目 ID：${session.question.id}`,
    '',
    '训练要求：',
    '1. 先让我独立初答，不要提前给框架或标准答案。',
    '2. 按 $competency-lab 的岗位能力画像、逐轮追问和阶段收束流程训练。',
    '3. 我完成自主总结后，再进行官方资料与小红书外部研究。',
    '4. 保留我的原始判断，明确区分事实、观点、假设和推断。',
    '5. 完成后生成 1 分钟和 3 分钟答案，并保存为飞书知识库文档。',
    `6. 文档标题必须同时包含“${session.question.company}”、`
      + `“产品 Sense”和题目 ID“${session.question.id}”。`,
    '7. 文档必须包含“用户原始答案”“金字塔结构与 MECE 检查”'
      + '“完整分析链路”“1 分钟答案”“3 分钟答案”。',
    `8. 必须把文档创建在这个知识库父节点下：${PM_SENSE_PARENT_URL}`,
    '9. 文档创建并写入完整后无需让我复制链接；我会回到工作台点击'
      + '“我已完成该题目”，由工作台检查并验收。',
  ].join('\n');
  return `codex://threads/new?prompt=${encodeURIComponent(prompt)}`;
};

const buildRegenerationTaskUrl = (
  session: ProductSenseSession,
  preference: string,
): string => {
  const prompt: string = [
    '请使用 $competency-lab Skill 的“每日题单”模式重新生成今天的 3 道题。',
    '同时完整读取 OfferLoop 项目中的 skills/competency-lab/SKILL.md 与'
      + ' skills/competency-lab/references/daily-question-generation.md。',
    `目标日期：${session.dailyDate}`,
    '先读取该用户今天最新批次的题目、全部不喜欢反馈与具体原因，'
      + '再生成 batch_no + 1 的新批次。',
    '新题必须覆盖不同互联网公司与不同逻辑类型；大众产品聚焦具体'
      + '功能或业务点，小众产品分析整体业务价值；每题都要有可核验'
      + '的官方事实来源。',
    preference.trim()
      ? `用户这次补充的偏好：${preference.trim()}`
      : '用户没有补充新偏好，请以已有拒绝反馈为准。',
    '将 3 道题直接写入 OfferLoop 工作台的'
      + ' product_sense_daily_question 表；不要删除旧批次，'
      + '不要修改代码或提交 Git。',
  ].join('\n');
  return `codex://threads/new?prompt=${encodeURIComponent(prompt)}`;
};

interface BackendErrorData {
  message?: unknown;
  error?: {
    message?: unknown;
  };
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  const responseData: BackendErrorData | undefined = (
    error as { response?: { data?: BackendErrorData } }
  ).response?.data;
  const responseMessage: unknown =
    responseData?.message ?? responseData?.error?.message;
  if (
    typeof responseMessage === 'string'
    && responseMessage.trim()
  ) {
    return responseMessage.trim();
  }
  return error instanceof Error ? error.message : fallback;
};

const ProductSenseCard: React.FC = () => {
  const [session, setSession] = useState<ProductSenseSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [dislikeOpen, setDislikeOpen] = useState<boolean>(false);
  const [dislikeQuestionId, setDislikeQuestionId] =
    useState<string>('');
  const [dislikeReason, setDislikeReason] =
    useState<ProductSenseDislikeReason>('不感兴趣');
  const [customDislikeDetail, setCustomDislikeDetail] =
    useState<string>('');
  const [dislikeError, setDislikeError] = useState<string>('');
  const [archiveUrl, setArchiveUrl] = useState<string>('');
  const [archiveCheckStatus, setArchiveCheckStatus] = useState<string>('');
  const [checkingArchive, setCheckingArchive] = useState<boolean>(false);
  const [regeneratePreference, setRegeneratePreference] =
    useState<string>('');
  const initialLoadRef = useRef<boolean>(false);

  const applySession = (nextSession: ProductSenseSession): void => {
    setSession(nextSession);
    setArchiveUrl(nextSession.lastArchiveUrl ?? '');
  };

  const loadSession = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      applySession(await getProductSenseSession());
    } catch (loadError: unknown) {
      setError(getErrorMessage(
        loadError,
        '暂时无法读取产品 Sense 推荐。',
      ));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialLoadRef.current) {
      return;
    }
    initialLoadRef.current = true;
    void loadSession();
  }, []);

  const startAgentTraining = async (
    question?: ProductSenseQuestion,
  ): Promise<void> => {
    if (!session) {
      return;
    }
    setSaving(true);
    setError('');
    let selectedSession: ProductSenseSession = session;
    try {
      if (question) {
        selectedSession = await selectProductSenseQuestion({
          questionId: question.id,
        });
        applySession(selectedSession);
      }
      selectedSession = await saveProductSenseDraft({
        draft: '',
        followupAnswers: {},
        selfSummary: '',
        status: 'answering',
      });
      applySession(selectedSession);
    } catch (startError: unknown) {
      setError(getErrorMessage(
        startError,
        '题目暂时无法锁定，请刷新后重试。',
      ));
      setSaving(false);
      return;
    }
    setSaving(false);
    toast.success('当前题已锁定，请在 Codex 中发送预填内容');
    window.location.assign(buildAgentTaskUrl(selectedSession));
  };

  const reopenAgentTraining = (): void => {
    if (!session) {
      return;
    }
    window.location.assign(buildAgentTaskUrl(session));
  };

  const completeAgentTraining = async (): Promise<void> => {
    setCheckingArchive(true);
    setArchiveCheckStatus('');
    setError('');
    try {
      const result: ProductSenseAutoCompleteResponse =
        await autoCompleteProductSense();
      if (!result.completed || !result.archiveUrl) {
        setArchiveCheckStatus(
          result.message ?? '暂未找到本题的完整飞书知识库文档。',
        );
        return;
      }
      applySession(result.session);
      setArchiveUrl(result.archiveUrl);
      setArchiveCheckStatus('');
      toast.success('本题已验收，下一题已推荐');
    } catch (checkError: unknown) {
      setArchiveCheckStatus(getErrorMessage(
        checkError,
        '检查飞书归档失败，请稍后再试。',
      ));
    } finally {
      setCheckingArchive(false);
    }
  };

  const switchQuestion = async (): Promise<void> => {
    if (
      dislikeReason === '其他原因'
      && customDislikeDetail.trim().length < 4
    ) {
      setDislikeError('请具体说明原因，至少填写 4 个字。');
      return;
    }
    setSaving(true);
    setError('');
    setDislikeError('');
    const input: ProductSenseFeedbackInput = {
      questionId: dislikeQuestionId || session?.question.id,
      reason: dislikeReason,
      detail: dislikeReason === '其他原因'
        ? customDislikeDetail.trim()
        : undefined,
    };
    try {
      const nextSession: ProductSenseSession =
        await switchProductSenseQuestion(input);
      applySession(nextSession);
      setDislikeOpen(false);
      setDislikeQuestionId('');
      setCustomDislikeDetail('');
      setArchiveUrl('');
      toast.success(
        `已记住这次反馈，共学习 ${nextSession.preference.feedbackCount} 次`,
      );
    } catch (switchError: unknown) {
      setDislikeError(getErrorMessage(
        switchError,
        '题目暂时无法更换，请稍后重试。',
      ));
    } finally {
      setSaving(false);
    }
  };

  const regenerateToday = (): void => {
    if (!session) {
      return;
    }
    window.location.assign(
      buildRegenerationTaskUrl(session, regeneratePreference),
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-primary" />
            产品 Sense
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>推荐加载失败</AlertTitle>
            <AlertDescription>
              {error || '暂时无法读取训练题目。'}
            </AlertDescription>
          </Alert>
          <Button className="mt-4" variant="outline" onClick={loadSession}>
            重新加载
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isRecommended: boolean = session.status === 'recommended';
  const isAgentTraining: boolean = !isRecommended;

  return (
    <>
      <Card data-ai-section-type="card-list">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="size-5 text-primary" />
                产品 Sense
              </CardTitle>
              <CardDescription>
                $competency-lab Agent 陪练 · 飞书归档后才会进入下一题
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {session.question.logicType}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {archiveUrl ? (
            <Alert variant="success">
              <CheckCircle2 />
              <AlertTitle>上一题已完成归档</AlertTitle>
              <AlertDescription>
                <a
                  className="inline-flex items-center gap-1 underline"
                  href={archiveUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开飞书训练文档
                  <ExternalLink className="size-3.5" />
                </a>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Sparkles className="size-3.5 text-primary" />
              <span className="font-medium">
                个人推荐记忆
              </span>
              <span className="text-muted-foreground">
                已长期记住 {session.preference.feedbackCount} 次反馈
              </span>
            </div>
            {session.preference.learnedSignals.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {session.preference.learnedSignals.map(
                  (signal: string) => (
                    <Badge key={signal} variant="outline">
                      {signal}
                    </Badge>
                  ),
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                反馈后会逐步学习你偏好的题目粒度、公司与赛道。
              </p>
            )}
          </div>

          {isRecommended && session.dailyQuestions.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  今日 3 题 · 选择一题后才会锁定
                </p>
                <span className="text-xs text-muted-foreground">
                  {session.dailyDate}
                </span>
              </div>
              {session.dailyQuestions.map(
                (question: ProductSenseQuestion) => (
                  <div
                    key={question.id}
                    className="space-y-3 rounded-xl border bg-muted/20 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{question.company}</Badge>
                      <Badge variant="secondary">
                        {question.logicType}
                      </Badge>
                    </div>
                    <p className="break-words text-base font-medium leading-7">
                      {question.prompt}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      事实锚点：{question.factAnchor}
                    </p>
                    <a
                      className="inline-flex items-center gap-1 text-xs underline"
                      href={question.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {question.sourceLabel}
                      <ExternalLink className="size-3" />
                    </a>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          void startAgentTraining(question);
                        }}
                        disabled={saving}
                      >
                        {saving ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <ArrowRight />
                        )}
                        选择这道题开始
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDislikeQuestionId(question.id);
                          setDislikeOpen(true);
                        }}
                        disabled={saving}
                      >
                        <HeartOff />
                        不喜欢
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : null}

          {isRecommended && session.canRegenerate ? (
            <div className="space-y-3 rounded-xl border border-dashed p-4">
              <div>
                <p className="font-medium">今天这批题都不合适</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  可以补充一句偏好，再让 $competency-lab Agent 生成新的一批。
                  旧题和拒绝原因会保留，用于后续个性化。
                </p>
              </div>
              <Textarea
                value={regeneratePreference}
                onChange={(
                  event: React.ChangeEvent<HTMLTextAreaElement>,
                ) => setRegeneratePreference(event.target.value)}
                placeholder="可选，例如：更关注商业化和推荐产品，少出支付题"
                maxLength={300}
                className="min-h-20 resize-y"
              />
              <Button onClick={regenerateToday}>
                <Sparkles />
                重新生成今日 3 题
              </Button>
              <p className="text-xs text-muted-foreground">
                Agent 完成后回到这里，点击“刷新题单”即可看到新题。
              </p>
              <Button variant="outline" onClick={loadSession}>
                刷新题单
              </Button>
            </div>
          ) : null}

          {isRecommended
            && session.dailyQuestions.length === 0
            && !session.canRegenerate ? (
              <Alert>
                <Sparkles />
                <AlertTitle>今日题单正在准备</AlertTitle>
                <AlertDescription>
                  题目由 $competency-lab Agent 动态生成，不从静态题库抽取。
                  准备完成后点击下方按钮读取一次。
                </AlertDescription>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={loadSession}
                >
                  刷新题单
                </Button>
              </Alert>
            ) : null}

          {!isRecommended ? (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{session.question.company}</Badge>
                <Badge variant="secondary">
                  {session.question.logicType}
                </Badge>
              </div>
              <p className="break-words text-base font-medium leading-7">
                {session.question.prompt}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                事实锚点：{session.question.factAnchor}
              </p>
            </div>
          ) : null}

          {!isRecommended ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>训练完成度</span>
                <span>{session.progress}%</span>
              </div>
              <Progress value={session.progress} />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5" />
                题目已锁定；归档前仍可放弃并返回题单
              </div>
            </div>
          ) : null}

          {isAgentTraining ? (
            <div className="space-y-4">
              <Alert>
                <Sparkles />
                <AlertTitle>
                  当前题已锁定，交由 $competency-lab Agent 陪练
                </AlertTitle>
                <AlertDescription>
                  Codex 会打开一个新任务并预填题目与训练要求。
                  你需要在 Codex 中点击一次发送。完成讨论并生成飞书
                  Wiki 文档后，回到这里点击“我已完成该题目”。
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={reopenAgentTraining}
                  disabled={saving}
                >
                  <ExternalLink />
                  再次新建 Agent 任务
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDislikeQuestionId(session.question.id);
                    setDislikeOpen(true);
                  }}
                  disabled={saving || checkingArchive}
                >
                  <HeartOff />
                  返回题单并标记不感兴趣
                </Button>
                <Button
                  onClick={() => {
                    void completeAgentTraining();
                  }}
                  disabled={saving || checkingArchive}
                >
                  {checkingArchive ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CheckCircle2 />
                  )}
                  我已完成该题目
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                仅在点击后检查一次飞书归档；验收通过前不会更换题目。
              </p>
              {archiveCheckStatus ? (
                <Alert variant="destructive">
                  <AlertTitle>本题暂未完成</AlertTitle>
                  <AlertDescription>
                    {archiveCheckStatus}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>操作未完成</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={dislikeOpen}
        onOpenChange={(open: boolean) => {
          setDislikeOpen(open);
          if (!open) {
            setDislikeError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isAgentTraining
                ? '放弃当前题并返回题单？'
                : '为什么不喜欢这道题？'}
            </DialogTitle>
            <DialogDescription>
              {isAgentTraining
                ? '未归档的工作台作答进度会被清空，本题不会计为完成；'
                  + '反馈仍会用于优化后续推荐。'
                : '反馈会长期保存在你的个人推荐记忆中，并影响后续题目排序；'
                  + '不会因一次反馈直接改写全局 Skill。'}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={dislikeReason}
            onValueChange={(value: string) => {
              setDislikeReason(value as ProductSenseDislikeReason);
              setDislikeError('');
            }}
          >
            {DISLIKE_REASONS.map(
              (reason: ProductSenseDislikeReason) => (
                <Label
                  key={reason}
                  htmlFor={`reason-${reason}`}
                  className="cursor-pointer rounded-lg border p-3"
                >
                  <RadioGroupItem
                    id={`reason-${reason}`}
                    value={reason}
                  />
                  {reason}
                </Label>
              ),
            )}
          </RadioGroup>
          {dislikeReason === '其他原因' ? (
            <div className="space-y-2">
              <Label htmlFor="custom-dislike-detail">
                请具体说明
              </Label>
              <Textarea
                id="custom-dislike-detail"
                value={customDislikeDetail}
                onChange={(
                  event: React.ChangeEvent<HTMLTextAreaElement>,
                ) => {
                  setCustomDislikeDetail(event.target.value);
                  setDislikeError('');
                }}
                placeholder="例如：这道题太偏支付行业，我缺少相关背景……"
                className="min-h-24 resize-y"
                maxLength={300}
                disabled={saving}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  原文会保存；能可靠识别时才转换为推荐偏好。
                </p>
                <span className="text-xs text-muted-foreground">
                  {customDislikeDetail.trim().length} / 300
                </span>
              </div>
            </div>
          ) : null}
          {dislikeError ? (
            <Alert variant="destructive">
              <AlertTitle>暂时无法换题</AlertTitle>
              <AlertDescription>{dislikeError}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDislikeOpen(false)}
              disabled={saving}
            >
              保留当前题
            </Button>
            <Button
              onClick={() => {
                void switchQuestion();
              }}
              disabled={
                saving
                || (
                  dislikeReason === '其他原因'
                  && customDislikeDetail.trim().length < 4
                )
              }
            >
              {saving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <HeartOff />
              )}
              {isAgentTraining
                ? '确认放弃并返回题单'
                : '提交反馈并换题'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export { ProductSenseCard };
