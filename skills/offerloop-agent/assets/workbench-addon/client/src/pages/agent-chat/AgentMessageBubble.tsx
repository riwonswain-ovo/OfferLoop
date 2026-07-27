import React from 'react';
import { Bot } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Streamdown } from '@/components/ui/streamdown';

interface AgentMessageBubbleProps {
  role: 'assistant' | 'user';
  content: string;
  skillTitle?: string;
}

const AgentMessageBubble: React.FC<AgentMessageBubbleProps> = ({
  role,
  content,
  skillTitle,
}) => (
  <article
    className={
      role === 'user'
        ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground'
        : 'flex max-w-[92%] items-start gap-3'
    }
  >
    {role === 'assistant' ? (
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Bot className="size-4" />
      </div>
    ) : null}
    <div className="min-w-0">
      {skillTitle ? (
        <Badge className="mb-2" variant="outline">
          {skillTitle}
        </Badge>
      ) : null}
      {role === 'assistant' ? (
        <Streamdown className="text-sm leading-7">{content}</Streamdown>
      ) : (
        <p className="break-words text-sm leading-6">{content}</p>
      )}
    </div>
  </article>
);

export default AgentMessageBubble;
