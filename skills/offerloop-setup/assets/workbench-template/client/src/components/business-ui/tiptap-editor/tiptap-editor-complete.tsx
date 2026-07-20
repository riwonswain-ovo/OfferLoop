'use client';

import { AttachmentToolbarButton } from '@/components/business-ui/tiptap-editor/components/attachment-toolbar-button';
import { BlockquoteToolbarButton } from '@/components/business-ui/tiptap-editor/components/blockquote-toolbar-button';
import { CodeBlockToolbarButton } from '@/components/business-ui/tiptap-editor/components/code-block-toolbar-button';
import { ColorHighlightToolbarButton } from '@/components/business-ui/tiptap-editor/components/color-highlight-toolbar-button';
import { HeadingToolbarButton } from '@/components/business-ui/tiptap-editor/components/heading-toolbar-button';
import { HorizontalRuleToolbarButton } from '@/components/business-ui/tiptap-editor/components/horizontal-rule-toolbar-button';
import { ImageUploadToolbarButton } from '@/components/business-ui/tiptap-editor/components/image-upload-toolbar-button';
import { LinkToolbarButton } from '@/components/business-ui/tiptap-editor/components/link-toolbar-button';
import { ListToolbarButton } from '@/components/business-ui/tiptap-editor/components/list-toolbar-button';
import { MarkToolbarButton } from '@/components/business-ui/tiptap-editor/components/mark-toolbar-button';
import { TextAlignToolbarButton } from '@/components/business-ui/tiptap-editor/components/text-align-toolbar-button';
import { UndoRedoToolbarButton } from '@/components/business-ui/tiptap-editor/components/undo-redo-toolbar-button';
import { CompleteKit } from '@/components/business-ui/tiptap-editor/extensions/complete-kit';
import {
  TiptapEditor,
  TiptapEditorContent,
  TiptapEditorToolbar,
  TiptapEditorToolbarSeparator,
  type TiptapEditorProps,
} from '@/components/business-ui/tiptap-editor/tiptap-editor';
import { cn } from '@/lib/utils';

export interface TiptapEditorCompleteProps extends Omit<
  TiptapEditorProps,
  'extensions'
> {
  /** 占位符文本 */
  placeholder?: string;
}

/**
 * 一个完整、开箱即用的富文本编辑器组件，包含预配置的工具栏。
 * 这是大多数使用场景下的推荐组件。
 *
 * 功能特性：
 * - 预配置的工具栏，包含常用的格式化选项
 * - 已内置完整样式，包括边框、焦点态等，你无需在此编辑器外包裹 div 实现样式
 * - 支持撤销/重做
 * - 标题样式 (H1-H6)
 * - 文本对齐
 * - 列表 (无序、有序、任务)
 * - 文本格式化 (加粗、斜体、下划线、删除线、代码)
 *
 * @example
 * ```tsx
 * <TiptapEditorComplete
 *   value={value}
 *   onValueChange={setValue}
 *   placeholder="在此输入消息..."
 *   aria-invalid={invalid}
 *   aria-disabled={disabled}
 * />
 * ```
 */
export function TiptapEditorComplete({
  className,
  placeholder,
  ...props
}: TiptapEditorCompleteProps) {
  const extensions = [CompleteKit.configure({ placeholder: { placeholder } })];

  return (
    <TiptapEditor
      className={cn('max-h-140 min-h-80', className)}
      extensions={extensions}
      {...props}
    >
      <DefaultToolbar />
      <TiptapEditorContent />
    </TiptapEditor>
  );
}

function DefaultToolbar() {
  return (
    <TiptapEditorToolbar>
      {/* 撤销/重做 */}
      <UndoRedoToolbarButton action="undo" />
      <UndoRedoToolbarButton action="redo" />
      <TiptapEditorToolbarSeparator />

      {/* 标题/正文 */}
      <HeadingToolbarButton />
      <TiptapEditorToolbarSeparator />

      {/* 文本对齐 & 列表 */}
      <TextAlignToolbarButton />
      <ListToolbarButton />
      <TiptapEditorToolbarSeparator />

      {/* 文本格式化: 加粗、删除线、斜体、下划线、颜色 */}
      <MarkToolbarButton format="bold" />
      <MarkToolbarButton format="strike" />
      <MarkToolbarButton format="italic" />
      <MarkToolbarButton format="underline" />
      <ColorHighlightToolbarButton />
      <TiptapEditorToolbarSeparator />

      {/* 块级元素: 引用、分割线、代码块 */}
      <BlockquoteToolbarButton />
      <HorizontalRuleToolbarButton />
      <CodeBlockToolbarButton />

      {/* 链接 & 媒体: 图片、附件 */}
      <LinkToolbarButton />
      <ImageUploadToolbarButton />
      <AttachmentToolbarButton />
    </TiptapEditorToolbar>
  );
}
