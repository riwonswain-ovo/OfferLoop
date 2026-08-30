'use client';

import * as React from 'react';
import { Link as LinkIcon } from 'lucide-react';

import { LinkEditForm } from '@/components/business-ui/tiptap-editor/components/link-edit-form';
import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
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

export function LinkToolbarButton() {
  const { editor } = useTiptapEditor();
  const [open, setOpen] = React.useState(false);
  const [initialText, setInitialText] = React.useState('');
  const [initialHref, setInitialHref] = React.useState('');

  if (!editor) return null;

  const resetForm = () => {
    setInitialText('');
    setInitialHref('');
  };

  const openDialog = () => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    const currentHref = (editor.getAttributes('link')?.href as string) || '';

    setInitialText(selectedText);
    setInitialHref(currentHref);
    setOpen(true);
  };

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className="size-6 px-0"
      onClick={openDialog}
      disabled={!editor.can().toggleLink({ href: '' })}
    >
      <LinkIcon className="size-4" />
      <span className="sr-only">链接</span>
    </Button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <TooltipProvider>
        <Tooltip delayDuration={700}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          {!open && (
            <TooltipContent>
              <p>链接</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        className="w-105 p-5 shadow-lg"
        align="start"
        sideOffset={6}
      >
        <LinkEditForm
          open={open}
          initialText={initialText}
          initialHref={initialHref}
          autoFocusHref
          onDone={() => {
            setOpen(false);
            resetForm();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
