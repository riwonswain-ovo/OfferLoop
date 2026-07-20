import type {
  BaseEntitySelectProps,
  ItemValue,
} from '@client/src/components/business-ui/entity-combobox/shared-types';
import type { User, I18nText, UserType, Department } from '@client/src/components/business-ui/types/user';

// 统一从 @lark-apaas/client-toolkit 导入 AccountType
export type { AccountType } from '@lark-apaas/client-toolkit/tools/services';
import type { AccountType } from '@lark-apaas/client-toolkit/tools/services';

// 重新导出统一的类型
export type { User, I18nText, UserType, Department };

/**
 * 值类型
 * - 'string': value 为 string 或 string[]（与 multiple 联动）
 * - 'object': value 为 User 或 User[]（与 multiple 联动）
 * @default 'string'
 */
export type ValueType = 'string' | 'object';

export type SearchAvatar = {
  avatar: {
    image: {
      large: string;
    };
  };
};

/**
 * UserSelect 的值类型（包装 User）
 */
export type UserSelectItemValue = ItemValue<User>;

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
    ? User[]              // ✅ 直接返回标准 User 类型
    : User | null;        // ✅ 直接返回标准 User 类型

type UserSelectBaseProps<
  V extends ValueType = 'string',
  M extends boolean = false,
> = Omit<
  BaseEntitySelectProps<UserSelectItemValue>,
  'value' | 'defaultValue' | 'onChange'
> & {
  /**
   * 值类型
   * - 'string': value 为 string 或 string[]（与 multiple 联动）
   * - 'object': value 为 User 或 User[]（与 multiple 联动）
   * @default 'string'
   */
  valueType?: V;
  /**
   * 是否多选
   * @default false
   */
  multiple?: M;
  /**
   * 账户类型，决定 value 中 id 字段的来源
   * @default 'apaas'
   */
  accountType?: AccountType;
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
 * UserSelect 组件 Props
 *
 * 类型组合：
 * | valueType | multiple | value 类型 |
 * |-----------|----------|------------|
 * | 'string'  | false    | string \| null |
 * | 'string'  | true     | string[] |
 * | 'object'  | false    | User \| null |
 * | 'object'  | true     | User[] |
 */
export type UserSelectProps =
  | UserSelectBaseProps<'string', false>
  | UserSelectBaseProps<'string', true>
  | UserSelectBaseProps<'object', false>
  | UserSelectBaseProps<'object', true>;

export type UserSelectValue =
  | User
  | User[]
  | string
  | string[]
  | null;
