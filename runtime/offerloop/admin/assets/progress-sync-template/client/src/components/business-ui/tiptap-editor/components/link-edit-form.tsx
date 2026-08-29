'use client';

import * as React from 'react';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface LinkEditFormProps extends React.ComponentProps<'div'> {
  open: boolean;
  initialText?: string;
  initialHref?: string;
  /** 打开时自动聚焦到链接输入框。 */
  autoFocusHref?: boolean;
  onDone?: () => void;
}

export function LinkEditForm({
  open,
  initialText = '',
  initialHref = '',
  autoFocusHref = false,
  onDone,
  className,
  ...props
}: LinkEditFormProps) {
  const { editor } = useTiptapEditor();
  const [text, setText] = React.useState('');
  const [href, setHref] = React.useState('');

  const hrefInputRef = React.useRef<HTMLInputElement | null>(null);

  const textId = React.useId();
  const hrefId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    setText(initialText);
    setHref(initialHref);
  }, [open, initialHref, initialText]);

  React.useEffect(() => {
    if (!open) return;
    if (!autoFocusHref) return;

    const id = window.setTimeout(() => {
      hrefInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(id);
  }, [autoFocusHref, open]);

  if (!editor) return null;

  const isInLink = editor.isActive('link');
  const selectionEmpty = editor.state.selection.empty;

  const hrefTrimmed = href.trim();
  const textTrimmed = text.trim();

  const canSubmit =
    hrefTrimmed.length > 0 &&
    (!selectionEmpty || isInLink || textTrimmed.length);

  const applyLink = () => {
    if (!canSubmit) return;

    if (textTrimmed.length > 0) {
      if (isInLink && editor.state.selection.empty) {
        editor.chain().focus().extendMarkRange('link').run();
      } else {
        editor.chain().focus().run();
      }

      editor.commands.insertContent({
        type: 'text',
        text: textTrimmed,
        marks: [{ type: 'link', attrs: { href: hrefTrimmed } }],
      });
    } else {
      const chain = editor.chain().focus();
      if (isInLink) chain.extendMarkRange('link');
      chain.setLink({ href: hrefTrimmed }).run();
    }

    onDone?.();
  };

  return (
    <div className={cn('flex flex-col gap-4', className)} {...props}>
      <div className="flex items-center gap-4">
        <Label htmlFor={textId} className="w-10 shrink-0">
          文本
        </Label>
        <Input
          id={textId}
          className="h-8"
          placeholder="请输入文本"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-4">
        <Label htmlFor={hrefId} className="w-10 shrink-0">
          链接
        </Label>
        <Input
          id={hrefId}
          className="h-8"
          placeholder="粘贴或输入链接"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          ref={hrefInputRef}
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" disabled={!canSubmit} onClick={applyLink}>
          确定
        </Button>
      </div>
    </div>
  );
}
