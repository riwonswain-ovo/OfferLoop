'use client';

import * as React from 'react';
import { Link2Off, Pencil } from 'lucide-react';

import { LinkEditForm } from '@/components/business-ui/tiptap-editor/components/link-edit-form';
import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type LinkHoverMode = 'toolbar' | 'edit';

export interface LinkHoverToolbarProps extends React.ComponentProps<'div'> {
  /** Hover 链接后延时展示工具栏的时长（ms）。默认 700ms。 */
  openDelay?: number;
}

function getClosestLinkEl(
  target: EventTarget | null,
): HTMLAnchorElement | null {
  if (!target || !(target instanceof HTMLElement)) return null;
  const el = target.closest('a[href]');
  if (!el) return null;
  return el as HTMLAnchorElement;
}

function safeTextContent(el: HTMLElement | null) {
  return (el?.textContent || '').trim();
}

export function LinkHoverToolbar({
  openDelay = 700,
  className,
  ...props
}: LinkHoverToolbarProps) {
  const { editor } = useTiptapEditor();
  const showTimerRef = React.useRef<number | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const afterCloseTimerRef = React.useRef<number | null>(null);
  const linkElRef = React.useRef<HTMLAnchorElement | null>(null);
  const hoveringLinkRef = React.useRef(false);
  const hoveringPopoverRef = React.useRef(false);

  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<LinkHoverMode>('toolbar');
  const [anchor, setAnchor] = React.useState<{
    left: number;
    top: number;
  } | null>(null);
  const [initialText, setInitialText] = React.useState('');
  const [initialHref, setInitialHref] = React.useState('');

  const clearShowTimer = React.useCallback(() => {
    if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
    showTimerRef.current = null;
  }, []);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const clearAfterCloseTimer = React.useCallback(() => {
    if (afterCloseTimerRef.current) {
      window.clearTimeout(afterCloseTimerRef.current);
    }
    afterCloseTimerRef.current = null;
  }, []);

  const resetStateAfterClose = React.useCallback(() => {
    setMode('toolbar');
    setAnchor(null);
    setInitialHref('');
    setInitialText('');
  }, []);

  const scheduleResetAfterClose = React.useCallback(() => {
    // PopoverContent 有关闭动画（animate-out）。关闭时如果立刻清空 anchor/href/text/mode，
    // 会出现：内容先变空（布局抖动）或失去 anchor（跳到左上角）再消失。
    clearAfterCloseTimer();

    afterCloseTimerRef.current = window.setTimeout(() => {
      resetStateAfterClose();
      afterCloseTimerRef.current = null;
    }, 200);
  }, [clearAfterCloseTimer, resetStateAfterClose]);

  const resetInteractionState = React.useCallback(() => {
    clearShowTimer();
    clearCloseTimer();
    hoveringLinkRef.current = false;
    hoveringPopoverRef.current = false;
    linkElRef.current = null;
  }, [clearCloseTimer, clearShowTimer]);

  const closePopover = React.useCallback(() => {
    setOpen(false);
    resetInteractionState();
    scheduleResetAfterClose();
  }, [resetInteractionState, scheduleResetAfterClose]);

  const computeAnchor = React.useCallback(() => {
    if (!editor) return;
    const linkEl = linkElRef.current;
    if (!linkEl) return;

    const editorRoot = editor.view.dom.closest(
      "[data-slot='tiptap-editor']",
    ) as HTMLElement | null;

    const linkRect = linkEl.getBoundingClientRect();
    const rootRect = editorRoot?.getBoundingClientRect();
    if (!rootRect) return;

    setAnchor({
      left: linkRect.left - rootRect.left,
      top: linkRect.bottom - rootRect.top,
    });
  }, [editor]);

  const scheduleCloseIfNeeded = React.useCallback(() => {
    if (mode === 'edit') return;
    clearCloseTimer();

    closeTimerRef.current = window.setTimeout(() => {
      if (hoveringLinkRef.current || hoveringPopoverRef.current) return;
      closePopover();
    }, 120);
  }, [clearCloseTimer, closePopover, mode]);

  const openForLink = React.useCallback(
    (linkEl: HTMLAnchorElement) => {
      clearAfterCloseTimer();
      linkElRef.current = linkEl;
      setInitialHref(linkEl.getAttribute('href') || '');
      setInitialText(safeTextContent(linkEl));

      setMode('toolbar');
      computeAnchor();
      setOpen(true);
    },
    [clearAfterCloseTimer, computeAnchor],
  );

  React.useEffect(() => {
    if (!editor || !editor.view?.dom) return;
    if (!editor.isEditable) return;

    const dom = editor.view.dom;

    const handlePointerOver = (event: PointerEvent) => {
      const linkEl = getClosestLinkEl(event.target);
      if (!linkEl) return;

      if (linkElRef.current !== linkEl) {
        clearShowTimer();
        clearCloseTimer();
      }

      hoveringLinkRef.current = true;
      linkElRef.current = linkEl;

      if (open && mode === 'edit') {
        return;
      }

      if (open && linkElRef.current === linkEl) {
        computeAnchor();
        return;
      }

      clearShowTimer();
      showTimerRef.current = window.setTimeout(() => {
        if (!hoveringLinkRef.current) return;
        openForLink(linkEl);
      }, openDelay);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const fromLinkEl = getClosestLinkEl(event.target);
      if (!fromLinkEl) return;

      const toLinkEl = getClosestLinkEl(event.relatedTarget);
      if (toLinkEl && toLinkEl === fromLinkEl) return;

      hoveringLinkRef.current = false;
      clearShowTimer();

      if (open) scheduleCloseIfNeeded();
    };

    dom.addEventListener('pointerover', handlePointerOver);
    dom.addEventListener('pointerout', handlePointerOut);

    return () => {
      dom.removeEventListener('pointerover', handlePointerOver);
      dom.removeEventListener('pointerout', handlePointerOut);
      clearShowTimer();
      clearCloseTimer();
      clearAfterCloseTimer();
    };
  }, [
    clearCloseTimer,
    clearAfterCloseTimer,
    clearShowTimer,
    computeAnchor,
    editor,
    mode,
    open,
    openDelay,
    openForLink,
    scheduleCloseIfNeeded,
  ]);

  React.useEffect(() => {
    if (!open) return;

    const handleWindow = () => computeAnchor();
    window.addEventListener('scroll', handleWindow, true);
    window.addEventListener('resize', handleWindow);

    return () => {
      window.removeEventListener('scroll', handleWindow, true);
      window.removeEventListener('resize', handleWindow);
    };
  }, [computeAnchor, open]);

  if (!editor || !editor.isEditable) return null;

  const href = initialHref.trim();

  const selectHoveredLink = (options?: { focus?: boolean }) => {
    const focus = options?.focus ?? false;
    const linkEl = linkElRef.current;
    if (!linkEl) return;

    try {
      const pos = editor.view.posAtDOM(linkEl, 0);
      if (focus) {
        editor.chain().focus().setTextSelection(pos).run();
      } else {
        editor.commands.setTextSelection(pos);
      }
    } catch {
      if (focus) editor.chain().focus().run();
    }
  };

  const unlink = () => {
    selectHoveredLink({ focus: true });
    editor.chain().extendMarkRange('link').unsetLink().run();
    closePopover();
  };

  return (
    <div
      className={cn('pointer-events-none absolute inset-0', className)}
      {...props}
    >
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            resetInteractionState();
            scheduleResetAfterClose();
          } else {
            clearAfterCloseTimer();
          }
        }}
      >
        {anchor && (
          <PopoverAnchor asChild>
            <span
              aria-hidden="true"
              className="absolute"
              style={{
                left: anchor.left,
                top: anchor.top,
                width: 1,
                height: 1,
              }}
            />
          </PopoverAnchor>
        )}

        <PopoverContent
          align="start"
          sideOffset={6}
          className={cn(
            'w-105 shadow-lg',
            mode === 'toolbar' ? 'px-4 py-3' : 'p-5',
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={() => {
            hoveringPopoverRef.current = true;
            clearCloseTimer();
          }}
          onMouseLeave={() => {
            hoveringPopoverRef.current = false;
            scheduleCloseIfNeeded();
          }}
        >
          {mode === 'toolbar' ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate text-sm text-foreground">
                {href}
              </div>

              <TooltipProvider>
                <Tooltip delayDuration={700}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-6 px-0"
                      onClick={() => {
                        // NOTE: 不要在这里 focus 编辑器，否则 Radix Popover 会因为 focus outside 直接 dismiss，
                        // 从而出现“偶尔没切到表单而是关闭弹层”的竞态。
                        clearCloseTimer();
                        selectHoveredLink({ focus: false });
                        setMode('edit');
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">编辑链接</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>编辑链接</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip delayDuration={700}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-6 px-0"
                      onClick={unlink}
                    >
                      <Link2Off className="size-4" />
                      <span className="sr-only">移除链接</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>移除链接</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <LinkEditForm
              open={open && mode === 'edit'}
              initialText={initialText}
              initialHref={initialHref}
              autoFocusHref
              onDone={() => {
                closePopover();
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
