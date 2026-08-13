import type {
  BaseEntitySelectProps,
  ItemValue,
} from '@client/src/components/business-ui/entity-combobox/shared-types';
import type { I18nText } from '@client/src/components/business-ui/entity-combobox/types';

export type { I18nText };

/**
 * 群组原始信息（对应 SearchChatEntity）
 */
export type ChatInfo = {
  /** 群组 ID */
  chatID: string;
  /** 群组名称（国际化文本） */
  name: I18nText;
  /** 头像：URL 或 16 进制 RGB 颜色 */
  avatar: string;
  /** 是否是外部群 */
  isExternal?: boolean;
  /** 群成员数量（不包括机器人） */
  userCount?: number;
};

/**
 * 标准化后的群组数据（用于 BaseCombobox）
 */
export type Chat = ItemValue<ChatInfo>;

/**
 * 值类型
 * - 'string': value 为 chatID 字符串
 * - 'object': value 为 Chat 对象
 * @default 'string'
 */
export type ValueType = 'string' | 'object';

/**
 * 根据 valueType 和 multiple 推断 value 类型
 */
export type InferValue<
  V extends ValueType,
  M extends boolean,
> = V extends 'string'
  ? M extends true
    ? string[]
    : string | null
  : M extends true
    ? Chat[]
    : Chat | null;

type ChatSelectBaseProps<
  V extends ValueType = 'string',
  M extends boolean = false,
> = Omit<
  BaseEntitySelectProps<Chat>,
  'value' | 'defaultValue' | 'onChange'
> & {
  /**
   * 值类型
   * - 'string': value 为 chatID 字符串
   * - 'object': value 为 Chat 对象
   * @default 'string'
   */
  valueType?: V;
  /**
   * 是否多选
   * @default false
   */
  multiple?: M;
  /**
   * 当前值
   */
  value?: InferValue<V, M>;
  /**
   * 默认值
   */
  defaultValue?: InferValue<V, M>;
  /**
   * 值变化回调
   */
  onChange?: (value: InferValue<V, M>) => void;
};

/**
 * ChatSelect 组件 Props
 *
 * 类型组合：
 * | valueType | multiple | value 类型 |
 * |-----------|----------|------------|
 * | 'string'  | false    | string \| null |
 * | 'string'  | true     | string[] |
 * | 'object'  | false    | Chat \| null |
 * | 'object'  | true     | Chat[] |
 */
export type ChatSelectProps =
  | ChatSelectBaseProps<'string', false>
  | ChatSelectBaseProps<'string', true>
  | ChatSelectBaseProps<'object', false>
  | ChatSelectBaseProps<'object', true>;

export type ChatSelectValue = Chat | Chat[] | string | string[] | null;
