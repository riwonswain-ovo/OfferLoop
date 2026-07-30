# Tiptap Editor

> 基于 [Tiptap](https://tiptap.dev) 构建的富文本编辑器组件，提供开箱即用和可组合两种使用模式。

## 快速开始

### 推荐：使用 `TiptapEditorComplete`

对于大多数场景，直接使用 `TiptapEditorComplete` 即可。它封装了完整的工具栏和样式，开箱即用。

```tsx
import { TiptapEditorComplete } from '@/components/business-ui/tiptap-editor';

function MyEditor() {
  const [value, setValue] = React.useState('');

  return (
    <TiptapEditorComplete
      value={value}
      onValueChange={setValue}
      placeholder="请输入内容..."
    />
  );
}
```

#### `TiptapEditorComplete` Props

| Prop            | 类型                      | 默认值 | 描述                     |
| :-------------- | :------------------------ | :----- | :----------------------- |
| `value`         | `string`                  | -      | 受控值 (HTML 字符串)     |
| `defaultValue`  | `string`                  | -      | 非受控默认值             |
| `onValueChange` | `(value: string) => void` | -      | 内容变更回调             |
| `placeholder`   | `string`                  | -      | 占位符文本               |
| `readOnly`      | `boolean`                 | false  | 只读模式                 |
| `aria-disabled` | `boolean`                 | -      | 禁用状态                 |
| `aria-invalid`  | `boolean`                 | -      | 无效状态（用于表单校验） |
| `className`     | `string`                  | -      | 自定义样式类             |

#### ⚠️ 样式注意事项

**组件已包含完整的边框、内边距、Hover 边框、聚焦环等等丰富且完整的视觉样式，请勿在外层添加额外包装！**

```tsx
// ❌ 错误：不要用 div 包裹并添加 border、padding、overflow-auto 等样式
// 例如这段代码会导致展示多层 border，编辑器聚焦时聚焦环被截断等问题
<div className="border rounded-lg overflow-auto">
  <TiptapEditorComplete ... />
</div>

// ✅ 正确：直接使用，只建议添加 w-full、h-auto 等尺寸类
// 完整版组件默认具有 max-h-140 min-h-80，必要时可覆盖。
<TiptapEditorComplete className="w-full max-h-100" ... />
```

---

## 组合式 API（高级用法）

> ⚠️ **警告**：必须优先使用 `TiptapEditorComplete`！仅当用户**明确要求自定义工具栏**或**添加特殊功能**时，才使用组合式 API。绝大多数场景下，`TiptapEditorComplete` 已能满足需求。

当需要 **自定义工具栏布局** 或 **添加特殊功能** 时，使用组合式 API。

```tsx
import {
  TiptapEditor,
  TiptapEditorContent,
  TiptapEditorToolbar,
  TiptapEditorToolbarSeparator,
  UndoRedoToolbarButton,
  MarkToolbarButton,
  HeadingToolbarButton,
  ListToolbarButton,
  TextAlignToolbarButton,
  ColorHighlightToolbarButton,
  BlockquoteToolbarButton,
  HorizontalRuleToolbarButton,
  CodeBlockToolbarButton,
  LinkToolbarButton,
  ImageUploadToolbarButton,
  AttachmentToolbarButton,
  CompleteKit,
} from '@/components/business-ui/tiptap-editor';

function CustomEditor() {
  // placeholder 需要通过 CompleteKit 配置
  const extensions = [CompleteKit.configure({ placeholder: { placeholder: '请输入内容...' } })];

  return (
    <TiptapEditor extensions={extensions}>
      <CustomToolbar />
      <TiptapEditorContent />
    </TiptapEditor>
  );
}

/** 自定义工具栏：可根据需求自由组合按钮 */
function CustomToolbar() {
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
```

### 核心组件

| 组件                           | 描述                                     |
| :----------------------------- | :--------------------------------------- |
| `TiptapEditor`                 | 根组件，提供 Editor Context 和编辑器实例 |
| `TiptapEditorToolbar`          | 工具栏容器，用于放置工具栏按钮           |
| `TiptapEditorContent`          | 编辑区域，渲染可编辑内容                 |
| `TiptapEditorToolbarSeparator` | 工具栏分隔符，用于视觉分组               |

### `TiptapEditor` Props

| Prop            | 类型                      | 默认值          | 描述                   |
| :-------------- | :------------------------ | :-------------- | :--------------------- |
| `value`         | `string`                  | -               | 受控值 (HTML)          |
| `defaultValue`  | `string`                  | -               | 非受控默认值           |
| `onValueChange` | `(value: string) => void` | -               | 内容变更回调           |
| `extensions`    | `Extensions`              | `[CompleteKit]` | 自定义 Tiptap 扩展     |
| `readOnly`      | `boolean`                 | `false`         | 只读模式               |
| `autoFocus`     | `boolean`                 | -               | 自动聚焦               |
| `asChild`       | `boolean`                 | `false`         | 使用子元素作为渲染容器 |

---

## 工具栏按钮参考

所有工具栏按钮均已在 `index.ts` 导出，可直接组合使用：

| 组件                          | 功能           | Props / 说明                                                      |
| :---------------------------- | :------------- | :---------------------------------------------------------------- |
| `UndoRedoToolbarButton`       | 撤销 / 重做    | `action: "undo" \| "redo"`                                        |
| `HeadingToolbarButton`        | 标题级别选择   | 下拉菜单，支持正文和 H1-H6                                        |
| `MarkToolbarButton`           | 文本格式       | `format: "bold" \| "italic" \| "underline" \| "strike" \| "code"` |
| `ListToolbarButton`           | 列表           | 下拉菜单，支持无序、有序、任务列表                                |
| `TextAlignToolbarButton`      | 文本对齐       | 下拉菜单，支持左、中、右、两端对齐                                |
| `ColorHighlightToolbarButton` | 文字颜色与高亮 | 颜色选择器                                                        |
| `LinkToolbarButton`           | 超链接         | 点击弹出链接编辑表单                                              |
| `BlockquoteToolbarButton`     | 引用块         | 切换引用样式                                                      |
| `CodeBlockToolbarButton`      | 代码块         | 插入代码块（Shiki 语法高亮）                                      |
| `HorizontalRuleToolbarButton` | 水平分割线     | 插入分割线                                                        |
| `ImageUploadToolbarButton`    | 图片上传       | 需配置 `image.upload` 函数                                        |
| `AttachmentToolbarButton`     | 附件上传       | 需配置 `attachment.upload` 函数，支持 `accept` prop               |

---

## 扩展 (Extensions)

### CompleteKit

`CompleteKit` 是预配置的扩展集合，包含所有常用编辑功能。它是 `TiptapEditor` 的默认扩展。

```tsx
import { TiptapEditor, TiptapEditorContent, CompleteKit } from '@/components/business-ui/tiptap-editor';

// 使用默认配置
<TiptapEditor extensions={[CompleteKit]}>
  <TiptapEditorContent />
</TiptapEditor>

// 自定义配置
<TiptapEditor
  extensions={[
    CompleteKit.configure({
      // 禁用图片扩展
      image: false,
      // 自定义 placeholder
      placeholder: { placeholder: '开始输入...' },
      // 限制标题级别
      heading: { levels: [1, 2, 3] },
      // 禁用链接
      link: false,
    }),
  ]}
>
  <TiptapEditorContent />
</TiptapEditor>
```

#### CompleteKit 包含的扩展

| 类别     | 扩展                                                        |
| :------- | :---------------------------------------------------------- |
| **基础** | Document, Paragraph, Text, HardBreak, Dropcursor, Gapcursor |
| **历史** | Undo, Redo                                                  |
| **标题** | Heading (H1-H6)                                             |
| **文本** | Bold, Italic, Underline, Strike, Code                       |
| **颜色** | TextStyle, Color, Highlight                                 |
| **对齐** | TextAlign                                                   |
| **列表** | BulletList, OrderedList, ListItem, TaskList, TaskItem       |
| **块级** | Blockquote, HorizontalRule, CodeBlock (Shiki)               |
| **链接** | Link (autolink, openOnClick)                                |
| **媒体** | Image, Attachment                                           |
| **其他** | Placeholder                                                 |

#### CompleteKit 配置选项

```typescript
interface CompleteKitOptions {
  // 设置为 false 可禁用对应扩展
  heading?: { levels: number[] } | false;
  link?: { autolink?: boolean; openOnClick?: boolean } | false;
  codeBlock?: false;
  taskList?: Partial<TaskListOptions> | false;
  taskItem?: { nested?: boolean } | false;
  textStyle?: Partial<TextStyleOptions> | false;
  color?: Partial<ColorOptions> | false;
  highlight?: { multicolor?: boolean } | false;
  textAlign?: { types: string[] } | false;
  image?: Partial<ImageOptions> | false;
  attachment?: Partial<AttachmentOptions> | false;
  placeholder?: { placeholder?: string } | false;
  // ... 以及所有 StarterKit 选项
}
```

---

## 目录结构

```text
tiptap-editor/
├── index.ts                      # 统一导出入口
├── tiptap-editor.tsx             # 核心组件 (TiptapEditor, TiptapEditorToolbar, TiptapEditorContent)
├── tiptap-editor-complete.tsx    # 完整封装版 (TiptapEditorComplete)
├── components/                   # 富文本依赖的组件，其中工具栏按钮以 toolbar-button 结尾
├── extensions/                   # 自定义 Tiptap 扩展
│   ├── ...
│   └── complete-kit.ts           # 完整扩展集合
└── hooks/
    └── use-tiptap-editor.ts      # 编辑器实例 Hook
```

---

## 开发指南

### 添加新的工具栏按钮

1. 在 `components/` 目录创建新组件：

```tsx
// components/business-ui/tiptap-editor/components/my-toolbar-button.tsx
'use client';

import { useTiptapEditor } from '@/components/business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { Button } from '@/components/ui/button';

export function MyToolbarButton() {
  const { editor } = useTiptapEditor();

  if (!editor) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="size-6 px-0"
      disabled={!editor.can().myCommand()}
      onClick={() => editor.chain().focus().myCommand().run()}
    >
      {/* Icon */}
    </Button>
  );
}
```

2. 在 `index.ts` 中导出：

```tsx
export { MyToolbarButton } from '@/components/business-ui/tiptap-editor/components/my-toolbar-button';
```

### 添加自定义扩展

1. 在 `extensions/` 目录创建扩展文件
2. 如需集成到 CompleteKit，修改 `extensions/complete-kit.ts`
3. 通过 `extensions` prop 传入：

```tsx
import { MyExtension } from './extensions/my-extension';

<TiptapEditor extensions={[CompleteKit, MyExtension]} />;
```

---

## 相关资源

- [Tiptap LLM 文档](https://tiptap.dev/llms.txt)
