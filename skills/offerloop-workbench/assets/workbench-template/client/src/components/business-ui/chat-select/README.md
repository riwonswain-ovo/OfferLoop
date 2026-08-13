# ChatSelect 群组选择组件

**组件路径**：`@/components/business-ui/chat-select`

---

## 群组类型

```typescript
/** 群组数据结构 */
interface Chat {
  /** 唯一标识：对应 chatID */
  id: string;
  /** 群组名称：内部优先 zh_cn，其次 en_us */
  name: string;
  /** 头像：URL 或 16 进制 RGB 颜色 */
  avatar: string;
}
```

---

## 功能概述

- 群组字段选择组件，用于表单中录入"群组"字段
- 通过触发器打开弹层，弹层内置搜索功能（始终可用）
- **仅支持 ID 模式**：`value/onChange` 只使用群组 `chatID`（string），该 ID 为飞书群聊 ID。
- 组件在 UI 上可展示群组信息（头像/名称），但对外值仅返回/接收 `chatID`
- 选择后自动回显已选群组信息：群头像 + 群名称（多选以 tag 形式展示）
- 组件自带群组检索能力，无需额外传搜索接口/数据源

## 类型定义

```typescript
/** 触发器类型 */
type TriggerType = 'button' | 'search' | 'custom';

/** 单选模式 Props */
interface ChatSelectSingleProps {
  /** 当前选中的群组 ID，空值为 null */
  value: string | null;
  /** 选中变化回调 */
  onChange: (value: string | null) => void;
  /** 是否多选，单选时为 false 或不传 */
  multiple?: false;
  /** 触发器类型，仅影响样式，不影响搜索功能 */
  triggerType?: TriggerType;
  /** 是否禁用 */
  disabled?: boolean;
  /** 占位文本 */
  placeholder?: string;
}

/** 多选模式 Props */
interface ChatSelectMultipleProps {
  /** 当前选中的群组 ID 列表，空值为 [] */
  value: string[];
  /** 选中变化回调 */
  onChange: (value: string[]) => void;
  /** 是否多选，多选时为 true */
  multiple: true;
  /** 触发器类型 */
  triggerType?: TriggerType;
  /** 是否禁用 */
  disabled?: boolean;
  /** 占位文本 */
  placeholder?: string;
}

type ChatSelectProps = ChatSelectSingleProps | ChatSelectMultipleProps;
```

## Props 说明

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` | `string \| null` / `string[]` | - | **必填**。单选传 `string \| null`（群组 ID），多选传 `string[]` |
| `onChange` | `function` | - | **必填**。值变化回调，返回值形态与 `value` 匹配 |
| `multiple` | `boolean` | `false` | 是否多选 |
| `triggerType` | `'button' \| 'search' \| 'custom'` | `'button'` | 触发器类型，仅影响样式 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `placeholder` | `string` | `'请选择'` | 占位文本 |
| `getOptionDisabled` | `(chat) => boolean` | - | 判断选项是否禁用 |

## 受控规范

> ⚠️ **强约束**

1. **必须受控**：始终传 `value` + `onChange`
2. **禁止传**：`undefined` / 群组对象 / 其他类型
3. **空值规则**：
   - 单选清空：`null`
   - 多选清空：`[]`

## 使用示例

```tsx
import { useState } from 'react';
import { ChatSelect } from '@/components/business-ui/chat-select';

// 单选
function SingleSelectExample() {
  const [chatId, setChatId] = useState<string | null>(null);

  return (
    <ChatSelect
      value={chatId}
      onChange={setChatId}
      placeholder="请选择群组"
    />
  );
}

// 多选
function MultipleSelectExample() {
  const [chatIds, setChatIds] = useState<string[]>([]);

  return (
    <ChatSelect
      multiple
      value={chatIds}
      onChange={setChatIds}
      placeholder="请选择群组"
      getOptionDisabled={(chat) => chat.id === 'disabled-id'}
    />
  );
}
```
