import { Extension } from '@tiptap/core';
import Color, { type ColorOptions } from '@tiptap/extension-color';
import Highlight, { type HighlightOptions } from '@tiptap/extension-highlight';
import type { LinkOptions } from '@tiptap/extension-link';
import Placeholder, {
  type PlaceholderOptions,
} from '@tiptap/extension-placeholder';
import TaskItem, { type TaskItemOptions } from '@tiptap/extension-task-item';
import TaskList, { type TaskListOptions } from '@tiptap/extension-task-list';
import TextAlign, { type TextAlignOptions } from '@tiptap/extension-text-align';
import { TextStyle, type TextStyleOptions } from '@tiptap/extension-text-style';
import StarterKit, { type StarterKitOptions } from '@tiptap/starter-kit';

import {
  Attachment,
  type AttachmentExtensionOptions,
} from '@/components/business-ui/tiptap-editor/extensions/attachment';
import { CodeBlockShiki } from '@/components/business-ui/tiptap-editor/extensions/code-block-shiki';
import {
  Image,
  type ImageOptions,
} from '@/components/business-ui/tiptap-editor/extensions/image';

/**
 * 从 StarterKitOptions 中排除不需要单独配置的选项
 */
type StarterKitBaseOptions = Omit<
  StarterKitOptions,
  'heading' | 'link' | 'codeBlock'
>;

export interface CompleteKitOptions extends StarterKitBaseOptions {
  // #region 块级扩展
  /**
   * Heading 配置。设置为 false 禁用。
   * @default { levels: [1, 2, 3, 4, 5, 6] }
   */
  heading: StarterKitOptions['heading'];

  /**
   * CodeBlock (Shiki 语法高亮) 配置。设置为 false 禁用。
   * 注意：此扩展使用 CodeBlockShiki 替代官方 CodeBlock。
   */
  codeBlock: false;
  // #endregion

  // #region 行内标记扩展
  /**
   * Link 配置。设置为 false 禁用。
   * @default { autolink: true, openOnClick: true }
   */
  link: Partial<LinkOptions> | false;
  // #endregion

  // #region 列表扩展
  /**
   * TaskList 配置。设置为 false 禁用。
   */
  taskList: Partial<TaskListOptions> | false;

  /**
   * TaskItem 配置。设置为 false 禁用。
   * @default { nested: true }
   */
  taskItem: Partial<TaskItemOptions> | false;
  // #endregion

  // #region 样式扩展
  /**
   * TextStyle 配置。设置为 false 禁用。
   */
  textStyle: Partial<TextStyleOptions> | false;

  /**
   * Color 配置。设置为 false 禁用。
   */
  color: Partial<ColorOptions> | false;

  /**
   * Highlight 配置。设置为 false 禁用。
   * @default { multicolor: true }
   */
  highlight: Partial<HighlightOptions> | false;

  /**
   * TextAlign 配置。设置为 false 禁用。
   * @default { types: ["heading", "paragraph"] }
   */
  textAlign: Partial<TextAlignOptions> | false;
  // #endregion

  // #region 媒体扩展
  /**
   * Image 配置。设置为 false 禁用。
   */
  image: Partial<ImageOptions> | false;

  /**
   * Attachment 配置。设置为 false 禁用。
   */
  attachment: Partial<AttachmentExtensionOptions> | false;
  // #endregion

  // #region 其他扩展
  /**
   * Placeholder 配置。设置为 false 禁用。
   * @default { placeholder: "请输入..." }
   */
  placeholder: Partial<PlaceholderOptions> | false;
  // #endregion
}

/**
 * CompleteKit 是一个完整的编辑器扩展集合。
 *
 * 它是构建富文本编辑器的良好起点，包含了所有常用的编辑功能。
 *
 * @example
 * ```ts
 * // 使用默认配置
 * const editor = useEditor({
 *   extensions: [CompleteKit],
 * })
 *
 * // 自定义配置
 * const editor = useEditor({
 *   extensions: [
 *     CompleteKit.configure({
 *       // 禁用 image 扩展
 *       image: false,
 *       // 自定义 placeholder
 *       placeholder: { placeholder: "开始输入..." },
 *       // 自定义 heading
 *       heading: { levels: [1, 2, 3] },
 *       // 禁用 link
 *       link: false,
 *     }),
 *   ],
 * })
 * ```
 */
export const CompleteKit = Extension.create<CompleteKitOptions>({
  name: 'completeKit',

  addExtensions() {
    const extensions = [];

    // StarterKit 基础扩展（排除 heading、link、codeBlock）
    const starterKitOptions: Partial<StarterKitOptions> = {
      // 将顶级选项映射到 StarterKit
      blockquote: this.options.blockquote,
      bold: this.options.bold,
      bulletList: this.options.bulletList,
      code: this.options.code,
      document: this.options.document,
      dropcursor: this.options.dropcursor,
      gapcursor: this.options.gapcursor,
      hardBreak: this.options.hardBreak,
      horizontalRule: this.options.horizontalRule,
      italic: this.options.italic,
      listItem: this.options.listItem,
      listKeymap: this.options.listKeymap,
      orderedList: this.options.orderedList,
      paragraph: this.options.paragraph,
      strike: this.options.strike,
      text: this.options.text,
      trailingNode: this.options.trailingNode,
      underline: this.options.underline,
      undoRedo: this.options.undoRedo,
      // 默认禁用 StarterKit 的 codeBlock，使用 CodeBlockShiki 替代
      codeBlock: false,
      // 配置 heading
      heading:
        this.options.heading !== false
          ? {
              levels: [1, 2, 3, 4, 5, 6],
              ...this.options.heading,
            }
          : false,
      // 配置 link
      link:
        this.options.link !== false
          ? {
              autolink: true,
              openOnClick: true,
              ...this.options.link,
            }
          : false,
    };

    extensions.push(StarterKit.configure(starterKitOptions));

    // CodeBlock (Shiki)
    if (this.options.codeBlock !== false) {
      extensions.push(CodeBlockShiki);
    }

    // TaskList & TaskItem
    if (this.options.taskList !== false) {
      extensions.push(TaskList.configure(this.options.taskList));
    }

    if (this.options.taskItem !== false) {
      extensions.push(
        TaskItem.configure({
          nested: true,
          ...this.options.taskItem,
        }),
      );
    }

    // 样式扩展
    if (this.options.textStyle !== false) {
      extensions.push(TextStyle.configure(this.options.textStyle));
    }

    if (this.options.color !== false) {
      extensions.push(Color.configure(this.options.color));
    }

    if (this.options.highlight !== false) {
      extensions.push(
        Highlight.configure({
          multicolor: true,
          ...this.options.highlight,
        }),
      );
    }

    if (this.options.textAlign !== false) {
      extensions.push(
        TextAlign.configure({
          types: ['heading', 'paragraph'],
          ...this.options.textAlign,
        }),
      );
    }

    // 媒体扩展
    if (this.options.image !== false) {
      extensions.push(Image.configure(this.options.image));
    }

    if (this.options.attachment !== false) {
      extensions.push(Attachment.configure(this.options.attachment));
    }

    // 其他扩展
    if (this.options.placeholder !== false) {
      extensions.push(
        Placeholder.configure({
          placeholder: '请输入...',
          ...this.options.placeholder,
        }),
      );
    }

    return extensions;
  },
});
