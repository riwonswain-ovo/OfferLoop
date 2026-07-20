'use client';

import { Minus } from 'lucide-react';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function HorizontalRuleToolbarButton() {
  const { editor } = useTiptapEditor();
  if (!editor) return null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={700}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            disabled={!editor.can().setHorizontalRule()}
            aria-label="分割线"
            className="size-6 px-0"
          >
            <Minus className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>分割线(⌘+Option+S)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
