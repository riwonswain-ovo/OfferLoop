import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import {
  Archive,
  Folder,
  LoaderCircle,
  MessageSquare,
  MessageSquarePlus,
  X,
} from 'lucide-react';

import type {
  AgentConversationSummary,
  AgentKnowledgeNode,
} from '@shared/agent-chat.interface';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { resolveConversationCategory } from './agent-conversation-category';

interface AgentConversationNavigatorProps {
  activeSessionId: string | null;
  conversations: AgentConversationSummary[];
  disabled: boolean;
  knowledgeNodes: AgentKnowledgeNode[];
  onArchive: (conversation: AgentConversationSummary) => void;
  onClose: () => void;
  onNew: () => void;
  onSelect: (conversation: AgentConversationSummary) => void;
}

interface ConversationGroup {
  title: string;
  conversations: AgentConversationSummary[];
}

const AgentConversationNavigator: React.FC<
  AgentConversationNavigatorProps
> = ({
  activeSessionId,
  conversations,
  disabled,
  knowledgeNodes,
  onArchive,
  onClose,
  onNew,
  onSelect,
}) => {
  const groups: ConversationGroup[] = useMemo((): ConversationGroup[] => {
    const activeGroups: Map<string, AgentConversationSummary[]> = new Map();
    const archived: AgentConversationSummary[] = [];
    for (const conversation of conversations) {
      if (conversation.state === 'archived') {
        archived.push(conversation);
        continue;
      }
      const title: string = resolveConversationCategory(
        conversation,
        knowledgeNodes,
      );
      const current: AgentConversationSummary[] =
        activeGroups.get(title) ?? [];
      current.push(conversation);
      activeGroups.set(title, current);
    }
    const resolved: ConversationGroup[] = Array.from(
      activeGroups.entries(),
      ([title, groupedConversations]): ConversationGroup => ({
        conversations: groupedConversations,
        title,
      }),
    );
    if (archived.length > 0) {
      resolved.push({ conversations: archived, title: '已归档' });
    }
    return resolved;
  }, [conversations, knowledgeNodes]);

  return (
    <div className="absolute inset-0 z-30 flex min-w-0 flex-col overflow-hidden bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">对话任务</h2>
          <p className="text-xs text-muted-foreground">
            按飞书知识库分类，可查看、续聊或归档
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="新建对话"
          disabled={disabled}
          onClick={onNew}
        >
          <MessageSquarePlus />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="关闭对话任务"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="w-full max-w-full space-y-6 overflow-hidden p-3">
          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <MessageSquare className="mx-auto mb-2 size-6 text-muted-foreground" />
              <p className="text-sm font-medium">还没有历史对话</p>
              <p className="mt-1 text-xs text-muted-foreground">
                发送第一条消息后，对话会保存在这里。
              </p>
            </div>
          ) : null}

          {groups.map((group: ConversationGroup) => (
            <section key={group.title}>
              <div className="mb-2 flex items-center gap-2 px-2">
                <Folder className="size-3.5 text-primary" />
                <h3 className="truncate text-xs font-semibold text-muted-foreground">
                  {group.title}
                </h3>
                <Badge variant="secondary" className="ml-auto">
                  {group.conversations.length}
                </Badge>
              </div>
              <div className="w-full min-w-0 space-y-1">
                {group.conversations.map(
                  (conversation: AgentConversationSummary) => (
                    <div
                      key={conversation.sessionId}
                      className={cn(
                        'group flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-xl border px-1 py-1 transition-colors',
                        activeSessionId === conversation.sessionId
                          ? 'border-primary/30 bg-primary/10'
                          : 'border-transparent hover:bg-muted',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 px-2 py-2 text-left"
                        disabled={disabled}
                        onClick={(): void => onSelect(conversation)}
                      >
                        <p className="truncate text-sm font-medium">
                          {conversation.title}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {dayjs(conversation.updatedAt).format('M月D日 HH:mm')}
                          {' · '}
                          {conversation.messageCount} 条消息
                        </p>
                      </button>
                      {conversation.state !== 'archived' ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`归档对话：${conversation.title}`}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          disabled={
                            disabled || conversation.state === 'archiving'
                          }
                          title="归档对话"
                          onClick={(): void => onArchive(conversation)}
                        >
                          {conversation.state === 'archiving' ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Archive />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export { AgentConversationNavigator };
