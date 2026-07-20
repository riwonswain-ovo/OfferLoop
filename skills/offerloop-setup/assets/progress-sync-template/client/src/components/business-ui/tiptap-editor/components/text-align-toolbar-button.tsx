'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
} from 'lucide-react';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ALIGN_OPTIONS = [
  { value: 'left', label: '左对齐', icon: AlignLeft },
  { value: 'center', label: '居中对齐', icon: AlignCenter },
  { value: 'right', label: '右对齐', icon: AlignRight },
] as const;

export function TextAlignToolbarButton() {
  const { editor } = useTiptapEditor();

  if (!editor) return null;

  const getCurrentAlignment = () => {
    if (editor.isActive({ textAlign: 'center' })) return 'center';
    if (editor.isActive({ textAlign: 'right' })) return 'right';
    return 'left';
  };

  const isDefaultLeft =
    !editor.isActive({ textAlign: 'center' }) &&
    !editor.isActive({ textAlign: 'right' }) &&
    !editor.isActive({ textAlign: 'justify' });

  const alignment = getCurrentAlignment();
  const currentOption = ALIGN_OPTIONS.find((opt) => opt.value === alignment);
  const Icon = currentOption?.icon ?? AlignLeft;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-0.5 px-2">
          <Icon className="size-4" />
          <ChevronDown className="size-3.5 text-muted-foreground" />
          <span className="sr-only">文字对齐</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-50">
        {ALIGN_OPTIONS.map((option) => {
          const OptionIcon = option.icon;
          const active =
            option.value === 'left'
              ? editor.isActive({ textAlign: 'left' }) || isDefaultLeft
              : editor.isActive({ textAlign: option.value });

          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() =>
                editor.chain().focus().setTextAlign(option.value).run()
              }
              disabled={!editor.can().setTextAlign(option.value)}
              className={cn('justify-between', active && 'bg-accent')}
            >
              <span className="flex items-center gap-2">
                <OptionIcon className="size-4" />
                {option.label}
              </span>
              {active && <Check className="size-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
