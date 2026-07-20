'use client';

import { BaseComboboxContent } from '@client/src/components/business-ui/entity-combobox/base-combobox-content';
import { BaseComboboxEmpty } from '@client/src/components/business-ui/entity-combobox/base-combobox-empty';
import { BaseComboboxItem } from '@client/src/components/business-ui/entity-combobox/base-combobox-item';
import { BaseComboboxList } from '@client/src/components/business-ui/entity-combobox/base-combobox-list';
import { BaseComboboxLoading } from '@client/src/components/business-ui/entity-combobox/base-combobox-loading';
import { BaseComboboxSearch } from '@client/src/components/business-ui/entity-combobox/base-combobox-search';
import { EntityCombobox } from '@client/src/components/business-ui/entity-combobox/entity-combobox';
import { PopoverWrapper } from '@client/src/components/business-ui/entity-combobox/popover-wrapper';
import type {
  BaseComboboxProps,
  ItemValue,
} from '@client/src/components/business-ui/entity-combobox/types';

export function BaseCombobox<
  T = unknown,
  TRaw = unknown,
  TValue extends ItemValue<TRaw> = ItemValue<TRaw>,
>(props: BaseComboboxProps<T, TRaw, TValue>) {
  const {
    fetchFn,
    size = 'medium',
    triggerType = 'button',
    renderTrigger,
    multiple = false,
    value,
    defaultValue,
    onChange,
    open,
    defaultOpen,
    onOpenChange,
    debounce = 300,
    disabled = false,
    showSearch = true,
    renderItem,
    renderTag,
    placeholder = '请选择',
    searchPlaceholder = '',
    emptyText = '没有匹配结果，换个关键词试试吧',
    loadingText = '加载中...',
    className,
    classNames = {},
    tagClosable = true,
    maxTagCount,
    maxTagTextLength,
    placement = 'bottom',
    align = 'start',
    sideOffset = 4,
    onSelect,
    onDeselect,
    onSearch,
    onClear,
    onFocus,
    onBlur,
    getItemValue = (item: unknown) =>
      ({
        id:
          (item as { id?: string; value?: string }).id ||
          (item as { id?: string; value?: string }).value ||
          '',
        name:
          (item as { name?: string; label?: string }).name ||
          (item as { name?: string; label?: string }).label ||
          '',
        avatar: (item as { avatar?: string }).avatar,
        raw: item,
      }) as TValue,
    getOptionDisabled,
    slotProps,
    children,
  } = props;

  // 浮层包装组件的通用 props
  const popoverProps = {
    size,
    triggerType,
    renderTrigger,
    placeholder,
    maxTagCount,
    maxTagTextLength,
    tagClosable,
    className,
    classNames,
    placement,
    align,
    sideOffset,
    showSearch,
    searchPlaceholder,
    renderItem: renderItem!,
    renderTag,
    getItemValue,
    getOptionDisabled,
    emptyText,
    loadingText,
    onFocus,
    onBlur,
    slotProps,
    children,
  };

  return (
    <EntityCombobox
      fetchFn={fetchFn}
      size={size}
      multiple={multiple}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      debounce={debounce}
      disabled={disabled}
      onSelect={onSelect}
      onDeselect={onDeselect}
      onSearch={onSearch}
      onClear={onClear}
      getItemValue={getItemValue}
    >
      <PopoverWrapper {...popoverProps} />
    </EntityCombobox>
  );
}

// 导出子组件以支持自定义使用
BaseCombobox.Content = BaseComboboxContent;
BaseCombobox.Search = BaseComboboxSearch;
BaseCombobox.List = BaseComboboxList;
BaseCombobox.Item = BaseComboboxItem;
BaseCombobox.Empty = BaseComboboxEmpty;
BaseCombobox.Loading = BaseComboboxLoading;
