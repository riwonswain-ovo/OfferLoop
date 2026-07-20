'use client';

import * as React from 'react';
import {
  EditorContent,
  EditorContext,
  useCurrentEditor,
  useEditor,
  type EditorContentProps,
  type Extensions,
} from '@tiptap/react';
import { Slot } from 'radix-ui';

import { LinkHoverToolbar } from '@/components/business-ui/tiptap-editor/components/link-hover-toolbar';
import { CompleteKit } from '@/components/business-ui/tiptap-editor/extensions/complete-kit';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

export interface TiptapEditorProps extends React.ComponentProps<'div'> {
  /** 受控 value (HTML)。 */
  value?: string;
  /** 默认值 (HTML)。 */
  defaultValue?: string;
  /** 当编辑器更新时，触发并传递最新的 HTML。 */
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
  className?: string;
  /**
   * 自定义 Tiptap 扩展。
   * @default [CompleteKit]
   */
  extensions?: Extensions;
  /** 是否为只读模式。 */
  readOnly?: boolean;
  asChild?: boolean;
}

const defaultExtensions = [CompleteKit];

export function TiptapEditor({
  value,
  defaultValue,
  onValueChange,
  children,
  className,
  extensions = defaultExtensions,
  readOnly = false,
  asChild = false,
  autoFocus = false,
  'aria-disabled': ariaDisabled,
  ...props
}: TiptapEditorProps) {
  const Comp = asChild ? Slot.Root : 'div';

  const initialContent = value !== undefined ? value : defaultValue;
  const editable = !readOnly && !ariaDisabled;

  const editor = useEditor({
    autofocus: autoFocus,
    editable,
    editorProps: {
      attributes: {
        class: cn('prose max-w-none flex-1 px-3 py-2 dark:prose-invert'),
      },
    },
    immediatelyRender: false,
    content: initialContent,
    onUpdate: ({ editor }) => {
      onValueChange?.(editor.getHTML());
    },
    extensions,
  });

  const valueRef = React.useRef(value);
  React.useEffect(() => {
    if (!editor || value === undefined) return;
    valueRef.current = value;

    // Tiptap 内部会使用 flushSync，因此我们将内容更新延迟到微任务队列
    queueMicrotask(() => {
      const current = editor.getHTML();
      if (valueRef.current !== current) {
        editor.commands.setContent(value);
      }
    });
  }, [value, editor]);

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  const contextValue = React.useMemo(() => ({ editor }), [editor]);

  return (
    <EditorContext value={contextValue}>
      <Comp
        aria-disabled={ariaDisabled}
        className={cn(
          "relative flex w-full flex-col rounded-md border ring-offset-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20 focus-within:outline-hidden hover:border-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 **:data-[type='taskList']:list-none **:data-[type='taskList']:p-0 [&_[data-type='taskList']>li]:flex [&_[data-type='taskList']>li]:items-start [&_[data-type='taskList']>li]:gap-2 [&_[data-type='taskList']>li>div]:min-w-0 [&_[data-type='taskList']>li>div]:flex-1 [&_[data-type='taskList']>li>div>p]:m-0 [&_[data-type='taskList']>li>label]:mt-0.5 [&_[data-type='taskList']>li>label]:shrink-0 **:[a]:cursor-pointer",
          className,
        )}
        data-slot="tiptap-editor"
        {...props}
      >
        {children}
        <LinkHoverToolbar />
      </Comp>
    </EditorContext>
  );
}

export function TiptapEditorContent({
  className,
  ...props
}: Omit<EditorContentProps, 'editor'>) {
  const { editor } = useCurrentEditor();

  return (
    <EditorContent
      editor={editor}
      className={cn(
        'flex flex-1 flex-col overflow-y-auto outline-hidden',
        className,
      )}
      data-slot="tiptap-editor-content"
      {...props}
    />
  );
}

export function TiptapEditorToolbar({
  className,
  children,
  asChild,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div';

  return (
    <Comp
      className={cn(
        'flex flex-wrap items-center gap-x-1 gap-y-2 p-1.5',
        className,
      )}
      data-slot="tiptap-editor-toolbar"
      {...props}
    >
      {children}
    </Comp>
  );
}

export function TiptapEditorToolbarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      orientation="vertical"
      className={cn(
        'mx-0.5 h-4 w-px bg-border data-[orientation=vertical]:h-4',
        className,
      )}
      data-slot="tiptap-editor-toolbar-separator"
      {...props}
    />
  );
}
