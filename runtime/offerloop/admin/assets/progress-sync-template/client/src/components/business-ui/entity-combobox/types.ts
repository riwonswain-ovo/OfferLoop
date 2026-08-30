import type { ReactNode } from 'react';

import type {
  ClassNamesConfig,
  ComboboxSize,
  ItemValue,
  PopoverSlotProps,
  TriggerRenderProps,
  TriggerType,
} from '@client/src/components/business-ui/entity-combobox/shared-types';

// 重新导出共享类型
export type {
  ItemValue,
  TriggerType,
  TriggerRenderProps,
  ClassNamesConfig,
  PopoverSlotProps,
  ComboboxSize,
};

/**
 * EntityCombobox 组件的 Props
 */
export type EntityComboboxProps<
  T = unknown,
  TRaw = unknown,
  TValue extends ItemValue<TRaw> = ItemValue<TRaw>,
> = {
  // 尺寸
  size?: ComboboxSize;

  // 数据获取
  fetchFn: (search: string) => Promise<{ items: T[] }>;

  // 受控/非受控
  multiple?: boolean;
  value?: TValue | TValue[] | null;
  defaultValue?: TValue | TValue[] | null;
  onChange?: (value: TValue | TValue[] | null) => void;

  // 弹层控制
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;

  // 配置
  pageSize?: number;
  debounce?: number;
  disabled?: boolean;

  // 回调
  onSelect?: (value: TValue) => void;
  onDeselect?: (value: TValue) => void;
  onSearch?: (value: string) => void;
  onClear?: () => void;

  children: ReactNode;

  // 转换函数
  getItemValue: (item: T) => TValue;
};

/**
 * EntityCombobox Context 值
 */
export type EntityComboboxContextValue<
  T = unknown,
  TRaw = unknown,
  TValue extends ItemValue<TRaw> = ItemValue<TRaw>,
> = {
  // 状态
  open: boolean;
  setOpen: (open: boolean) => void;
  searchValue: string;
  setSearchValue: (value: string) => void;
  selectedValue: TValue | TValue[] | null;
  debouncedSearch: string;

  // 方法
  handleSelect: (value: TValue) => void;
  handleDeselect: (value: TValue) => void;
  handleClear: () => void;

  // 数据
  data: T[];
  isFetching: boolean;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;

  // 配置
  multiple: boolean;
  disabled: boolean;
  size: ComboboxSize;
  isSuccess?: boolean;
  fetchStatus?: string;
  isPlaceholderData?: boolean;

  // 转换函数
  getItemValue: (item: T) => TValue;
};

/**
 * BaseCombobox 组件的 Props
 */
export type BaseComboboxProps<
  T = unknown,
  TRaw = unknown,
  TValue extends ItemValue<TRaw> = ItemValue<TRaw>,
> = {
  // 尺寸
  size?: ComboboxSize;

  // 数据获取
  fetchFn: (search: string) => Promise<{ items: T[] }>;

  // 触发器
  triggerType?: TriggerType;
  renderTrigger?: (props: TriggerRenderProps<TRaw>) => ReactNode;

  // 受控/非受控
  multiple?: boolean;
  value?: TValue | TValue[] | null;
  defaultValue?: TValue | TValue[] | null;
  onChange?: (value: TValue | TValue[] | null) => void;

  // 弹层控制
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;

  // 配置
  debounce?: number;
  disabled?: boolean;
  showSearch?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  name?: string;

  // 渲染函数
  renderItem: (
    item: T,
    isSelected: boolean,
    className?: string,
    disabled?: boolean,
  ) => ReactNode;
  renderTag?: (
    value: TValue,
    onClose: (value: TValue, e: React.MouseEvent) => void,
    disabled?: boolean,
  ) => ReactNode;
  /**
   * 判断选项是否禁用
   * @param value 选项值
   * @returns 如果返回 true，该选项将被禁用
   */
  getOptionDisabled?: (value: TValue) => boolean;
  getItemLabel?: (item: T) => string;

  // Placeholder
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;

  // 样式
  className?: string;
  classNames?: ClassNamesConfig;

  // 标签（多选）
  tagClosable?: boolean;
  maxTagCount?: number | 'responsive';
  maxTagTextLength?: number;

  // Popover 配置
  placement?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;

  // 回调
  onSelect?: (value: TValue) => void;
  onDeselect?: (value: TValue) => void;
  onSearch?: (value: string) => void;
  onClear?: () => void;
  onFocus?: (event: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLElement>) => void;

  // 转换函数
  getItemValue?: (item: T) => TValue;

  slotProps?: PopoverSlotProps;
  children?: ReactNode;
};

/**
 * PopoverWrapper 组件的 Props
 */
export type PopoverWrapperProps<
  T = unknown,
  TRaw = unknown,
  TValue extends ItemValue<TRaw> = ItemValue<TRaw>,
> = {
  size?: ComboboxSize;
  triggerType?: TriggerType;
  renderTrigger?: (props: TriggerRenderProps<TRaw>) => ReactNode;
  placeholder?: string;
  maxTagCount?: number | 'responsive';
  maxTagTextLength?: number;
  tagClosable?: boolean;
  className?: string;
  classNames?: ClassNamesConfig;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  showSearch?: boolean;
  searchPlaceholder?: string;
  renderItem: (
    item: T,
    isSelected: boolean,
    className?: string,
    disabled?: boolean,
  ) => ReactNode;
  renderTag?: (
    value: TValue,
    onClose: (value: TValue, e: React.MouseEvent) => void,
    disabled?: boolean,
  ) => ReactNode;
  getItemValue: (item: T) => TValue;
  getOptionDisabled?: (value: TValue) => boolean;
  emptyText?: string;
  loadingText?: string;
  onFocus?: (event: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLElement>) => void;
  slotProps?: PopoverSlotProps;
  children?: ReactNode;
};

/**
 * 国际化文本类型
 */
export type I18nText = {
  zh_cn: string;
  en_us?: string;
  ja_jp?: string;
};
