'use client';

import * as React from 'react';
import { Baseline, Check, ChevronDown } from 'lucide-react';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Design system colors matching Figma
const TEXT_COLORS = [
  { value: 'var(--foreground)', label: '默认', className: 'bg-foreground' },
  {
    value: 'var(--muted-foreground)',
    label: '次要',
    className: 'bg-muted-foreground',
  },
  { value: 'var(--color-red-600)', label: '红色', className: 'bg-red-600' },
  {
    value: 'var(--color-orange-500)',
    label: '橙色',
    className: 'bg-orange-500',
  },
  {
    value: 'var(--color-yellow-500)',
    label: '黄色',
    className: 'bg-yellow-500',
  },
  { value: 'var(--color-green-500)', label: '绿色', className: 'bg-green-500' },
  { value: 'var(--color-blue-600)', label: '蓝色', className: 'bg-blue-600' },
  {
    value: 'var(--color-purple-600)',
    label: '紫色',
    className: 'bg-purple-600',
  },
];

export function ColorHighlightToolbarButton() {
  const { editor } = useTiptapEditor();
  const [open, setOpen] = React.useState(false);

  if (!editor) return null;

  const currentColor =
    editor.getAttributes('textStyle').color || 'var(--foreground)';

  const disabled = !editor.can().setColor(TEXT_COLORS[0]!.value);

  const handleColorSelect = (color: string) => {
    if (color === 'var(--foreground)') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
  };

  const handleResetColor = () => {
    editor.chain().focus().unsetColor().run();
  };

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 gap-0.5 px-2"
      disabled={disabled}
    >
      <Baseline className="size-4" style={{ color: currentColor }} />
      <ChevronDown className="size-3.5 text-muted-foreground" />
      <span className="sr-only">文字颜色</span>
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip delayDuration={700}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          {!open && (
            <TooltipContent>
              <p>文字颜色</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="flex flex-col items-center gap-3">
          {/* Color grid */}
          <div className="flex gap-1">
            {TEXT_COLORS.map((color) => {
              const isSelected = currentColor === color.value;

              return (
                <button
                  key={color.value}
                  className={cn(
                    'relative flex size-6 items-center justify-center rounded-md p-0.5 transition-colors',
                    'hover:ring-1 hover:ring-ring/20',
                    isSelected && 'ring-1 ring-ring',
                  )}
                  onClick={() => handleColorSelect(color.value)}
                  title={color.label}
                >
                  <span
                    className={cn('size-5 rounded-[5px]', color.className)}
                  />
                  {isSelected && (
                    <Check className="absolute size-3.5 text-white" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Reset button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleResetColor}
          >
            恢复默认
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
