import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleCheck,
  History,
  LoaderCircle,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react';

import { logger } from '@lark-apaas/client-toolkit/logger';

import * as agentChat from '@client/src/api/agent-chat';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type {
  AgentChatCreateRunResponse,
  AgentChatRunResponse,
  AgentChatStatusResponse,
  AgentConversationCreateResponse,
  AgentConversationDetailResponse,
  AgentConversationMessage,
  AgentConversationSummary,
  AgentKnowledgeDirectoryResponse,
  AgentKnowledgeNode,
} from '@shared/agent-chat.interface';
import { QUICK_ACTIONS, type QuickAction } from './agent-chat.constants';
import { shouldSubmitAgentMessage } from './agent-chat-keyboard';
import { AgentConversationNavigator } from './AgentConversationNavigator';
import AgentMessageBubble from './AgentMessageBubble';

interface AgentChatPanelProps {
  onClose: () => void;
}

interface PendingConfirmation {
  confirmationMessage: string;
  message: string;
  routeTitle: string;
}

interface PersistedActiveRun {
  runId: string;
  title: string;
}

const SESSION_STORAGE_KEY: string = 'offerloop-agent-session-id';
const ACTIVE_RUN_STORAGE_KEY: string = 'offerloop-agent-active-run';
const POLL_INTERVAL_MS: number = 1_500;
const MAX_POLL_ATTEMPTS: number = 400;

const INITIAL_MESSAGE: AgentConversationMessage = {
  content:
    '你好，我是你的 **OfferLoop 智能助手**。直接告诉我你想完成什么，' +
    '我会选择合适的 Skill，在当前求职工作台内帮你处理。',
  createdAt: new Date(0).toISOString(),
  id: 'welcome',
  role: 'assistant',
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve: () => void): void => {
    window.setTimeout(resolve, milliseconds);
  });

const createMessage = (
  role: AgentConversationMessage['role'],
  content: string,
  skillTitle?: string,
): AgentConversationMessage => ({
  content,
  createdAt: new Date().toISOString(),
  id: crypto.randomUUID(),
  role,
  skillTitle,
});

const readPersistedActiveRun = (): PersistedActiveRun | null => {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(ACTIVE_RUN_STORAGE_KEY) ?? 'null',
    );
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as PersistedActiveRun).runId === 'string' &&
      typeof (value as PersistedActiveRun).title === 'string'
    ) {
      return value as PersistedActiveRun;
    }
  } catch {
    window.localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
  }
  return null;
};

const AgentChatPanel: React.FC<AgentChatPanelProps> = ({ onClose }) => {
  const initialActiveRunRef = useRef<PersistedActiveRun | null>(
    readPersistedActiveRun(),
  );
  const [status, setStatus] = useState<AgentChatStatusResponse | null>(null);
  const [conversations, setConversations] = useState<
    AgentConversationSummary[]
  >([]);
  const [activeConversation, setActiveConversation] =
    useState<AgentConversationSummary | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    window.localStorage.getItem(SESSION_STORAGE_KEY),
  );
  const [messages, setMessages] = useState<AgentConversationMessage[]>([
    INITIAL_MESSAGE,
  ]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<AgentKnowledgeNode[]>(
    [],
  );
  const [navigatorOpen, setNavigatorOpen] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(
    Boolean(initialActiveRunRef.current),
  );
  const [isStopping, setIsStopping] = useState<boolean>(false);
  const [progress, setProgress] = useState<string>('');
  const [streamingResult, setStreamingResult] = useState<string>('');
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initialActiveRunRef.current?.runId ?? null,
  );
  const [activeRunTitle, setActiveRunTitle] = useState<string>(
    initialActiveRunRef.current?.title ?? '',
  );
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [pendingArchive, setPendingArchive] =
    useState<AgentConversationSummary | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const refreshConversations = useCallback(async (): Promise<
    AgentConversationSummary[]
  > => {
    const response = await agentChat.listConversations();
    if (isMountedRef.current) {
      setConversations(response.conversations);
    }
    return response.conversations;
  }, []);

  const loadConversation = useCallback(
    async (sessionId: string): Promise<void> => {
      const detail: AgentConversationDetailResponse =
        await agentChat.getConversation(sessionId);
      if (!isMountedRef.current) {
        return;
      }
      setActiveConversation(detail.conversation);
      setActiveSessionId(sessionId);
      setMessages(
        detail.messages.length > 0 ? detail.messages : [INITIAL_MESSAGE],
      );
      setStreamingResult('');
      window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      if (detail.activeRun) {
        setActiveRunId(detail.activeRun.runId);
        setActiveRunTitle(detail.conversation.title);
        setIsSending(true);
        setIsStopping(detail.activeRun.status === 'cancel_requested');
        setProgress(detail.activeRun.progress);
      }
    },
    [],
  );

  useEffect((): (() => void) => {
    isMountedRef.current = true;
    const loadInitialData = async (): Promise<void> => {
      const savedSessionId: string | null =
        window.localStorage.getItem(SESSION_STORAGE_KEY);
      const [statusResult, conversationResult, knowledgeResult] =
        await Promise.allSettled([
          agentChat.getStatus(),
          agentChat.listConversations(),
          agentChat.getKnowledgeDirectory(),
        ]);
      if (!isMountedRef.current) {
        return;
      }
      if (statusResult.status === 'fulfilled') {
        setStatus(statusResult.value);
      } else {
        logger.error('加载 Agent 连接状态失败', statusResult.reason);
        setStatus({
          gateway: {
            configured: false,
            connected: false,
            message: 'Agent 暂未连接，请稍后刷新。',
          },
          skills: [],
        });
      }
      if (conversationResult.status === 'fulfilled') {
        const conversationResponse = conversationResult.value;
        setConversations(conversationResponse.conversations);
        if (
          savedSessionId &&
          conversationResponse.conversations.some(
            (conversation: AgentConversationSummary): boolean =>
              conversation.sessionId === savedSessionId,
          )
        ) {
          await loadConversation(savedSessionId);
        }
      } else {
        logger.error('加载 Agent 对话历史失败', conversationResult.reason);
      }
      if (knowledgeResult.status === 'fulfilled') {
        const directory: AgentKnowledgeDirectoryResponse =
          knowledgeResult.value;
        setKnowledgeNodes(
          Array.isArray(directory.nodes) ? directory.nodes : [],
        );
      } else {
        logger.info(
          '知识库目录接口不可用，Agent 对话使用内置分类',
          knowledgeResult.reason,
        );
      }
    };
    void loadInitialData();
    return (): void => {
      isMountedRef.current = false;
    };
  }, [loadConversation]);

  useEffect(() => {
    if (activeRunId) {
      window.localStorage.setItem(
        ACTIVE_RUN_STORAGE_KEY,
        JSON.stringify({
          runId: activeRunId,
          title: activeRunTitle,
        } satisfies PersistedActiveRun),
      );
      return;
    }
    window.localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
  }, [activeRunId, activeRunTitle]);

  useEffect((): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending, progress]);

  useEffect((): (() => void) | undefined => {
    if (!activeRunId) {
      return undefined;
    }
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        for (
          let attempt: number = 0;
          attempt < MAX_POLL_ATTEMPTS;
          attempt += 1
        ) {
          const run: AgentChatRunResponse = await agentChat.getRun(activeRunId);
          if (cancelled || !isMountedRef.current) {
            return;
          }
          setProgress(run.progress);
          if (typeof run.result === 'string') {
            setStreamingResult(run.result);
          }
          if (run.status === 'cancel_requested') {
            setIsStopping(true);
          }
          if (run.status === 'completed') {
            setActiveRunId(null);
            setIsSending(false);
            setIsStopping(false);
            setProgress('');
            setStreamingResult('');
            await refreshConversations();
            if (run.sessionId) {
              await loadConversation(run.sessionId);
            }
            return;
          }
          if (run.status === 'cancelled') {
            setActiveRunId(null);
            setIsSending(false);
            setIsStopping(false);
            setProgress('');
            setStreamingResult('');
            await refreshConversations();
            if (run.sessionId) {
              await loadConversation(run.sessionId);
            } else {
              setMessages(
                (
                  current: AgentConversationMessage[],
                ): AgentConversationMessage[] => [
                  ...current,
                  createMessage(
                    'assistant',
                    '任务已停止。你可以修改提示词后重新发送。',
                    activeRunTitle || undefined,
                  ),
                ],
              );
            }
            return;
          }
          if (run.status === 'failed') {
            throw new Error(run.error ?? 'Agent 任务执行失败');
          }
          await delay(POLL_INTERVAL_MS);
        }
        throw new Error('Agent 任务运行时间过长，请稍后重试');
      } catch (error: unknown) {
        if (cancelled || !isMountedRef.current) {
          return;
        }
        logger.error('轮询 OfferLoop Agent 任务失败', error);
        setMessages(
          (current: AgentConversationMessage[]): AgentConversationMessage[] => [
            ...current,
            createMessage(
              'assistant',
              error instanceof Error
                ? `任务没有完成：${error.message}`
                : '任务没有完成，请稍后重试。',
              activeRunTitle || undefined,
            ),
          ],
        );
        setActiveRunId(null);
        setIsSending(false);
        setIsStopping(false);
        setProgress('');
        setStreamingResult('');
        await refreshConversations().catch((): void => undefined);
      }
    };
    void poll();
    return (): void => {
      cancelled = true;
    };
  }, [activeRunId, activeRunTitle, loadConversation, refreshConversations]);

  const startRun = async (
    message: string,
    confirmed: boolean,
  ): Promise<void> => {
    const response: AgentChatCreateRunResponse = await agentChat.createRun({
      confirmed,
      message,
      sessionId: activeSessionId ?? undefined,
    });
    if (response.state === 'confirmation_required') {
      setPending({
        confirmationMessage:
          response.confirmationMessage ?? '这项操作需要你的确认。',
        message,
        routeTitle: response.route.title,
      });
      setIsSending(false);
      setIsStopping(false);
      return;
    }
    if (response.state === 'answered') {
      setMessages(
        (current: AgentConversationMessage[]): AgentConversationMessage[] => [
          ...current,
          createMessage(
            'assistant',
            response.reply ?? '你好！请告诉我你想完成什么。',
            response.route.title,
          ),
        ],
      );
      setIsSending(false);
      setIsStopping(false);
      setProgress('');
      setStreamingResult('');
      await refreshConversations().catch((): void => undefined);
      return;
    }
    if (!response.runId) {
      throw new Error('Agent 没有返回任务 ID');
    }
    setActiveRunTitle(response.route.title);
    setIsStopping(false);
    setProgress(`正在调用「${response.route.title}」…`);
    setStreamingResult('');
    setActiveRunId(response.runId);
  };

  const submitMessage = async (message: string): Promise<void> => {
    const normalizedMessage: string = message.trim();
    if (
      !normalizedMessage ||
      isSending ||
      !status?.gateway?.connected ||
      activeConversation?.state === 'archived'
    ) {
      return;
    }
    setMessages(
      (current: AgentConversationMessage[]): AgentConversationMessage[] => [
        ...current,
        createMessage('user', normalizedMessage),
      ],
    );
    setInput('');
    setPending(null);
    setIsSending(true);
    try {
      await startRun(normalizedMessage, false);
    } catch (error: unknown) {
      logger.error('OfferLoop Agent 对话失败', error);
      setMessages(
        (current: AgentConversationMessage[]): AgentConversationMessage[] => [
          ...current,
          createMessage(
            'assistant',
            error instanceof Error
              ? `任务没有完成：${error.message}`
              : '任务没有完成，请稍后重试。',
          ),
        ],
      );
      setProgress('');
      setStreamingResult('');
      setIsSending(false);
      setIsStopping(false);
    }
  };

  const stopActiveRun = async (): Promise<void> => {
    if (!activeRunId || !isSending || isStopping) {
      return;
    }
    setIsStopping(true);
    setProgress('正在停止任务…');
    try {
      await agentChat.cancelRun(activeRunId);
    } catch (error: unknown) {
      logger.error('停止 OfferLoop Agent 任务失败', error);
      setIsStopping(false);
      setProgress('停止失败，任务仍在继续');
    }
  };

  const confirmPending = async (): Promise<void> => {
    if (!pending || isSending) {
      return;
    }
    const confirmation: PendingConfirmation = pending;
    setPending(null);
    setIsSending(true);
    try {
      await startRun(confirmation.message, true);
    } catch (error: unknown) {
      logger.error('确认后的 Agent 任务失败', error);
      setMessages(
        (current: AgentConversationMessage[]): AgentConversationMessage[] => [
          ...current,
          createMessage(
            'assistant',
            error instanceof Error
              ? `任务没有完成：${error.message}`
              : '任务没有完成，请稍后重试。',
            confirmation.routeTitle,
          ),
        ],
      );
      setProgress('');
      setStreamingResult('');
      setIsSending(false);
      setIsStopping(false);
    }
  };

  const resetConversationState = (): void => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setActiveConversation(null);
    setActiveSessionId(null);
    setMessages([INITIAL_MESSAGE]);
    setInput('');
    setPending(null);
    setProgress('');
    setStreamingResult('');
    setIsStopping(false);
    setNavigatorOpen(false);
  };

  const startNewConversation = async (): Promise<void> => {
    if (isSending || !status?.gateway?.connected) {
      return;
    }
    resetConversationState();
    setIsSending(true);
    setActiveRunTitle('新建对话');
    setProgress('正在创建 Codex 对话…');
    try {
      const response: AgentConversationCreateResponse =
        await agentChat.createConversation();
      setActiveRunId(response.runId);
    } catch (error: unknown) {
      logger.error('创建 Codex 原生对话失败', error);
      setMessages([
        INITIAL_MESSAGE,
        createMessage(
          'assistant',
          error instanceof Error
            ? `新对话没有创建成功：${error.message}`
            : '新对话没有创建成功，请稍后重试。',
        ),
      ]);
      setIsSending(false);
      setProgress('');
    }
  };

  const selectConversation = (conversation: AgentConversationSummary): void => {
    if (isSending) {
      return;
    }
    setNavigatorOpen(false);
    void loadConversation(conversation.sessionId).catch((error: unknown) => {
      logger.error('打开 Agent 历史对话失败', error);
    });
  };

  const archiveConversation = (
    conversation: AgentConversationSummary,
  ): void => {
    if (isSending) {
      return;
    }
    setPendingArchive(conversation);
  };

  const confirmArchive = (): void => {
    if (!pendingArchive || isSending) {
      return;
    }
    const conversation: AgentConversationSummary = pendingArchive;
    setPendingArchive(null);
    const archive = async (): Promise<void> => {
      try {
        const response = await agentChat.archiveConversation(
          conversation.sessionId,
        );
        if (response.runId) {
          setActiveSessionId(conversation.sessionId);
          setActiveConversation(conversation);
          setActiveRunTitle('归档对话');
          setIsSending(true);
          setProgress('正在归档到 Codex…');
          setActiveRunId(response.runId);
          return;
        }
        await refreshConversations();
        await loadConversation(conversation.sessionId);
      } catch (error: unknown) {
        logger.error('归档 Agent 对话失败', error);
        setMessages(
          (current: AgentConversationMessage[]): AgentConversationMessage[] => [
            ...current,
            createMessage(
              'assistant',
              error instanceof Error
                ? `对话没有归档成功：${error.message}`
                : '对话没有归档成功，请稍后重试。',
              '归档对话',
            ),
          ],
        );
      }
    };
    void archive();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (shouldSubmitAgentMessage(event)) {
      event.preventDefault();
      void submitMessage(input);
    }
  };

  const connected: boolean = Boolean(status?.gateway?.connected);
  const skillCount: number = status?.skills?.length ?? 0;
  const archived: boolean = activeConversation?.state === 'archived';

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {activeConversation?.title ?? 'OfferLoop 智能助手'}
          </h2>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={
                connected
                  ? 'size-2 rounded-full bg-success'
                  : 'size-2 rounded-full bg-warning'
              }
            />
            {archived
              ? '已归档 · 只读历史'
              : connected
                ? `已连接 · ${skillCount} 个 Skills`
                : '等待连接'}
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="查看对话任务"
          onClick={(): void => setNavigatorOpen(true)}
        >
          <History />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="新建对话"
          disabled={isSending}
          onClick={(): void => {
            void startNewConversation();
          }}
        >
          <MessageSquarePlus />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="收起智能助手"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b bg-muted/35 px-4 py-2.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" />
        原生任务同步到 Codex，任务分类与飞书知识库保持一致
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col gap-5 px-4 py-5">
          {!connected && status ? (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>Agent 尚未连接</AlertTitle>
              <AlertDescription>
                {status.gateway?.message ??
                  'Agent 暂未连接，完成服务配置后即可在这里对话。'}
              </AlertDescription>
            </Alert>
          ) : null}

          {messages.map((message: AgentConversationMessage) => (
            <AgentMessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
              skillTitle={message.skillTitle}
            />
          ))}

          {messages.length === 1 && messages[0]?.id === 'welcome' ? (
            <div className="grid gap-2">
              {QUICK_ACTIONS.map((action: QuickAction) => (
                <Button
                  key={action.label}
                  type="button"
                  variant="ghost"
                  className="h-auto justify-start whitespace-normal border px-3 py-2.5 text-left text-sm"
                  disabled={!connected || isSending}
                  onClick={(): void => {
                    setInput(action.prompt);
                    window.requestAnimationFrame((): void => {
                      textareaRef.current?.focus();
                      textareaRef.current?.setSelectionRange(
                        action.prompt.length,
                        action.prompt.length,
                      );
                    });
                  }}
                >
                  <action.icon className="size-4 shrink-0 text-primary" />
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}

          {pending ? (
            <Alert variant="warning">
              <ShieldCheck />
              <AlertTitle>需要确认调用「{pending.routeTitle}」</AlertTitle>
              <AlertDescription>
                <p>{pending.confirmationMessage}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={(): void => {
                      void confirmPending();
                    }}
                  >
                    <CircleCheck />
                    确认继续
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={(): void => setPending(null)}
                  >
                    <X />
                    暂不执行
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {isSending ? (
            <>
              {streamingResult ? (
                <AgentMessageBubble
                  role="assistant"
                  content={streamingResult}
                  skillTitle={activeRunTitle || undefined}
                />
              ) : null}
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin text-primary" />
                <span>{progress || '正在理解你的需求…'}</span>
              </div>
            </>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <footer className="border-t bg-card p-4">
        <div className="rounded-2xl border bg-background p-2 shadow-sm">
          <Textarea
            ref={textareaRef}
            value={input}
            rows={3}
            maxLength={8_000}
            disabled={!connected || isSending || archived}
            className="max-h-40 min-h-16 resize-none border-0 shadow-none focus-visible:ring-0"
            placeholder={
              archived
                ? '该对话已归档，请新建对话继续'
                : connected
                  ? '告诉智能助手你想完成什么…'
                  : 'Agent 连接后即可开始对话'
            }
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void =>
              setInput(event.target.value)
            }
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center justify-between gap-3 px-1 pt-1">
            <span className="text-[11px] text-muted-foreground">
              {archived
                ? '归档对话仅供查看'
                : 'Enter 发送 · Shift + Enter 换行'}
            </span>
            <Button
              type="button"
              size="icon"
              disabled={
                isSending
                  ? !activeRunId || isStopping
                  : !connected || archived || !input.trim()
              }
              aria-label={isSending ? '停止任务' : '发送消息'}
              onClick={(): void => {
                if (isSending) {
                  void stopActiveRun();
                } else {
                  void submitMessage(input);
                }
              }}
              data-ai-section-type="button"
            >
              {isSending ? <Square className="fill-current" /> : <Send />}
            </Button>
          </div>
        </div>
      </footer>

      {navigatorOpen ? (
        <AgentConversationNavigator
          activeSessionId={activeSessionId}
          conversations={conversations}
          disabled={isSending}
          knowledgeNodes={knowledgeNodes}
          onArchive={archiveConversation}
          onClose={(): void => setNavigatorOpen(false)}
          onNew={(): void => {
            void startNewConversation();
          }}
          onSelect={selectConversation}
        />
      ) : null}

      <AlertDialog
        open={Boolean(pendingArchive)}
        onOpenChange={(open: boolean): void => {
          if (!open) {
            setPendingArchive(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>归档这个对话任务？</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingArchive?.title}”会归档到
              Codex，并移入这里的“已归档”分类。
              归档后仍可查看历史内容，但不能继续发送消息。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>暂不归档</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive}>
              归档到 Codex
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export { AgentChatPanel };
