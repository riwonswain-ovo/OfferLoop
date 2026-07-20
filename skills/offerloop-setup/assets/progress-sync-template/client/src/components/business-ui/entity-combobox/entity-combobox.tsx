'use client';

import { useCallback, useState } from 'react';
import { useControllableState } from 'radix-ui/internal';

import { EntityComboboxProvider } from '@client/src/components/business-ui/entity-combobox/context';
import { useDebounce } from '@client/src/components/business-ui/entity-combobox/hooks';
import type {
  EntityComboboxProps,
  ItemValue,
} from '@client/src/components/business-ui/entity-combobox/types';
import { useFetchData } from '@client/src/components/business-ui/entity-combobox/use-fetch-data';

export function EntityCombobox<
  T = unknown,
  TRaw = unknown,
  TValue extends ItemValue<TRaw> = ItemValue<TRaw>,
>(props: EntityComboboxProps<T, TRaw, TValue>) {
  const {
    fetchFn,
    size = 'medium',
    multiple = false,
    value: valueProp,
    defaultValue,
    onChange,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    debounce = 300,
    disabled = false,
    onSelect,
    onDeselect,
    onSearch,
    onClear,
    children,
    getItemValue,
  } = props;

  // 受控状态
  const [selectedValue, setSelectedValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue ?? (!multiple ? null : []),
    onChange,
  });

  const [searchValue, setSearchValue] = useState('');
  const debouncedSearch = useDebounce(searchValue, debounce);

  // 代理 onOpenChange，关闭时清空搜索
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setSearchValue('');
      }
      onOpenChange?.(newOpen);
    },
    [onOpenChange],
  );

  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: handleOpenChange,
  });

  // 使用自定义 hook 处理数据请求
  const { data, isFetching, isError, isSuccess, fetchStatus, refetch } =
    useFetchData<T>({
      fetchFn,
      enabled: open,
      search: debouncedSearch,
      onSearch,
    });

  // 选择逻辑
  const handleSelect = useCallback(
    (itemValue: TValue) => {
      if (!multiple) {
        setSelectedValue(itemValue);
        setOpen(false);
        onSelect?.(itemValue);
      } else {
        const current = Array.isArray(selectedValue) ? selectedValue : [];
        const isSelected = current.some((v) => v.id === itemValue.id);

        if (isSelected) {
          const newValue = current.filter((v) => v.id !== itemValue.id);
          setSelectedValue(newValue);
          onDeselect?.(itemValue);
        } else {
          const newValue = [...current, itemValue];
          setSelectedValue(newValue);
          onSelect?.(itemValue);
        }
      }
    },
    [multiple, selectedValue, setSelectedValue, setOpen, onSelect, onDeselect],
  );

  const handleDeselect = useCallback(
    (itemValue: TValue) => {
      if (multiple && Array.isArray(selectedValue)) {
        const newValue = selectedValue.filter((v) => v.id !== itemValue.id);
        setSelectedValue(newValue);
        onDeselect?.(itemValue);
      }
    },
    [multiple, selectedValue, setSelectedValue, onDeselect],
  );

  const handleClear = useCallback(() => {
    setSelectedValue(!multiple ? null : []);
    onClear?.();
  }, [multiple, setSelectedValue, onClear]);

  // Context 值
  const contextValue = {
    open,
    setOpen,
    searchValue,
    setSearchValue,
    selectedValue: selectedValue ?? (!multiple ? null : []),
    debouncedSearch,
    handleSelect,
    handleDeselect,
    handleClear,
    data,
    isFetching,
    isError,
    refetch,
    isSuccess,
    fetchStatus,
    isPlaceholderData: false,
    multiple,
    disabled,
    size,
    getItemValue: getItemValue as (item: unknown) => ItemValue,
  };

  return (
    <EntityComboboxProvider value={contextValue}>
      {children}
    </EntityComboboxProvider>
  );
}
