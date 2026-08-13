'use client';

import * as React from 'react';
import { Bold, Code, Italic, Strikethrough, Underline } from 'lucide-react';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MarkToolbarButtonProps {
  format: 'bold' | 'italic' | 'underline' | 'strike' | 'code';
  icon?: React.ReactNode;
  tooltip?: string;
}

export function MarkToolbarButton({
  format,
  icon,
  tooltip,
}: MarkToolbarButtonProps) {
  const { editor } = useTiptapEditor();

  if (!editor) return null;

  const isActive = editor.isActive(format);

  let disabled = false;

  switch (format) {
    case 'bold':
      disabled = !editor.can().toggleBold();
      break;
    case 'italic':
      disabled = !editor.can().toggleItalic();
      break;
    case 'underline':
      disabled = !editor.can().toggleUnderline();
      break;
    case 'strike':
      disabled = !editor.can().toggleStrike();
      break;
    case 'code':
      disabled = !editor.can().toggleCode();
      break;
  }

  const toggle = () => {
    switch (format) {
      case 'bold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'underline':
        editor.chain().focus().toggleUnderline().run();
        break;
      case 'strike':
        editor.chain().focus().toggleStrike().run();
        break;
      case 'code':
        editor.chain().focus().toggleCode().run();
        break;
    }
  };

  const icons = {
    bold: <Bold className="size-4" />,
    italic: <Italic className="size-4" />,
    underline: <Underline className="size-4" />,
    strike: <Strikethrough className="size-4" />,
    code: <Code className="size-4" />,
  };

  const labels: Record<typeof format, string> = {
    bold: '粗体',
    italic: '斜体',
    underline: '下划线',
    strike: '删除线',
    code: '行内代码',
  };

  const tooltips: Record<typeof format, string> = {
    bold: '粗体(⌘+B)',
    italic: '斜体(⌘+I)',
    underline: '下划线(⌘+U)',
    strike: '删除线(⌘+Shift+X)',
    code: '行内代码(⌘+E)',
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={700}>
        <TooltipTrigger>
          <Toggle
            size="sm"
            pressed={isActive}
            onPressedChange={toggle}
            disabled={disabled}
            aria-label={labels[format]}
            className="size-6 p-0"
            asChild
          >
            <div>{icon || icons[format]}</div>
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip || tooltips[format]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
