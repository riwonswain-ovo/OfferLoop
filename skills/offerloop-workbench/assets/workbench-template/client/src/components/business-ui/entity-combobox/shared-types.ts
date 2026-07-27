import type { FocusEvent, ReactNode } from 'react';

import { PopoverContent } from '@client/src/components/ui/popover';

// 重新导出 size 相关类型
export type { ComboboxSize } from '@client/src/components/business-ui/entity-combobox/size-variants';

/**
 * 通用选项值类型
 * @template TRaw - 原始数据类型，用于保留完整的原始对象
 */
export type ItemValue<TRaw = unknown> = {
  id: string;
  name: string;
  avatar?: string;
  raw?: TRaw;
};

/**
 * 触发器类型
 */
export type TriggerType = 'button' | 'search' | 'custom';

/**
 * 触发器渲染属性
 */
export type TriggerRenderProps<TRaw = unknown> = {
  selectedValue: ItemValue<TRaw> | ItemValue<TRaw>[] | null;
  multiple: boolean;
  open: boolean;
  disabled: boolean;
};

/**
 * 样式类名配置
 * 用于统一配置各个内部元素的自定义 className
 */
export type ClassNamesConfig = {
  /** 根容器的 className */
  root?: string;
  /** 触发器的 className */
  trigger?: string;
  /** 弹层内容的 className */
  popover?: string;
  /** 搜索框的 className */
  search?: string;
  /** 列表容器的 className */
  list?: string;
  /** 列表项的 className */
  listItem?: string;
  /** 标签的 className（多选模式） */
  tag?: string;
  /** 空状态的 className */
  empty?: string;
  /** 异常态的 className */
  error?: string;
  /** 加载状态的 className */
  loading?: string;
  /** 清除按钮元素的 className */
  clear?: string;
  /** 后缀元素的 className */
  suffix?: string;
};

/**
 * 弹层容器配置
 */
export type PopoverSlotProps = {
  popover?: React.ComponentProps<typeof PopoverContent>;
};

/**
 * 基础 Select 组件共享的 Props
 * 适用于 UserSelect、DepartmentSelect 等所有实体选择器
 */
export type BaseEntitySelectProps<TValue = ItemValue<unknown>> = {
  /**
   * 组件尺寸
   * @default "medium"
   */
  size?: 'medium' | 'small' | 'xs';

  /**
   * 触发器类型
   * - "button": 按钮样式触发器
   * - "search": 搜索框样式触发器
   * - "custom": 自定义触发器，需配合 renderTrigger 使用
   */
  triggerType?: TriggerType;

  /**
   * 自定义渲染触发器
   * @param props - 触发器渲染属性，包含选中值、多选状态、展开状态、禁用状态
   * @returns 自定义触发器的 ReactNode
   */
  renderTrigger?: (props: TriggerRenderProps<unknown>) => ReactNode;

  /**
   * 是否多选模式
   * @default false
   */
  multiple?: boolean;

  /**
   * 当前选中的值（受控模式）
   * - 单选时为 TValue | null
   * - 多选时为 TValue[] | null
   */
  value?: TValue | TValue[] | null;

  /**
   * 默认选中的值（非受控模式）
   * - 单选时为 TValue | null
   * - 多选时为 TValue[] | null
   */
  defaultValue?: TValue | TValue[] | null;

  /**
   * 选中值变化时的回调
   * @param value - 新的选中值
   */
  onChange?: (value: TValue | TValue[] | null) => void;

  /**
   * 弹层默认是否展开（非受控模式）
   * @default false
   */
  defaultOpen?: boolean;

  /**
   * 是否禁用组件
   * @default false
   */
  disabled?: boolean;

  /**
   * 是否自动聚焦
   * @default false
   */
  autoFocus?: boolean;

  /**
   * 是否必填（用于表单校验）
   * @default false
   */
  required?: boolean;

  /**
   * 表单字段名称
   */
  name?: string;

  /**
   * 根元素的自定义类名
   */
  className?: string;

  /**
   * 各元素的自定义类名配置
   * @example
   * classNames={{
   *   root: 'my-root',
   *   trigger: 'my-trigger',
   *   popover: 'my-popover',
   *   tag: 'my-tag',
   * }}
   */
  classNames?: ClassNamesConfig;

  /**
   * 未选中时显示的占位文本
   */
  placeholder?: string;

  /**
   * 选项列表为空时显示的文本
   */
  emptyText?: string;

  /**
   * 多选模式下，标签是否可关闭（显示删除按钮）
   * @default true
   */
  tagClosable?: boolean;

  /**
   * 多选模式下，最多显示的标签数量
   * - 数字: 最多显示指定数量的标签，超出部分显示 "+N"
   * - "responsive": 根据容器宽度自动计算显示数量
   */
  maxTagCount?: number | 'responsive';

  /**
   * 判断选项是否禁用
   * @param value 选项值
   * @returns 如果返回 true，该选项将被禁用，不能改变选中状态，已选中项的 tag 不显示删除按钮
   */
  getOptionDisabled?: (value: TValue) => boolean;

  /**
   * 选中选项时的回调
   * @param value - 被选中的选项值
   */
  onSelect?: (value: TValue) => void;

  /**
   * 取消选中选项时的回调（多选模式下生效）
   * @param value - 被取消选中的选项值
   */
  onDeselect?: (value: TValue) => void;

  /**
   * 清空所有选中值时的回调
   */
  onClear?: () => void;

  /**
   * 组件获得焦点时的回调
   * @param event - 焦点事件对象
   */
  onFocus?: (event: FocusEvent<HTMLElement>) => void;

  /**
   * 组件失去焦点时的回调
   * @param event - 焦点事件对象
   */
  onBlur?: (event: FocusEvent<HTMLElement>) => void;

  /**
   * 插槽属性配置，用于自定义内部组件的 props
   */
  slotProps?: PopoverSlotProps;
};

/**
 * Combobox 配置相关的 Props
 */
export type ComboboxConfigProps = {
  pageSize?: number;
  debounce?: number;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  showSearch?: boolean;
  required?: boolean;
  name?: string;
};

/**
 * Combobox 样式相关的 Props
 */
export type ComboboxStyleProps = {
  className?: string;
  popoverClassName?: string;
  classNames?: ClassNamesConfig;
};

/**
 * Combobox Placeholder 相关的 Props
 */
export type ComboboxPlaceholderProps = {
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
};

/**
 * Combobox 标签相关的 Props
 */
export type ComboboxTagProps = {
  tagClosable?: boolean;
  maxTagCount?: number | 'responsive';
  maxTagTextLength?: number;
};

/**
 * Combobox 弹层配置相关的 Props
 */
export type ComboboxPopoverProps = {
  placement?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
};

/**
 * Combobox 回调相关的 Props
 */
export type ComboboxCallbackProps<TRaw = unknown> = {
  onSelect?: (value: ItemValue<TRaw>) => void;
  onDeselect?: (value: ItemValue<TRaw>) => void;
  onSearch?: (value: string) => void;
  onClear?: () => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
};
