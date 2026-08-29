'use client';

import { Check } from 'lucide-react';

import { useEntityComboboxContext } from '@client/src/components/business-ui/entity-combobox/context';
import type { ItemValue } from '@client/src/components/business-ui/entity-combobox/types';
import { cn } from '@/lib/utils';
import { CommandItem } from '@client/src/components/ui/command';

export type BaseComboboxItemProps<T = unknown> = {
  item: T;
  getItemValue: (item: T) => ItemValue;
  isSelected: boolean;
  children: React.ReactNode;
  onSelect?: () => void;
  className?: string;
  /**
   * 是否禁用该选项
   * 禁用时不能改变选中状态
   */
  disabled?: boolean;
};

export function BaseComboboxItem<T>({
  item,
  getItemValue,
  isSelected,
  children,
  onSelect,
  className,
  disabled,
}: BaseComboboxItemProps<T>) {
  const { handleSelect } = useEntityComboboxContext();
  const itemValue = getItemValue(item);

  return (
    <CommandItem
      value={itemValue.id}
      disabled={disabled}
      onSelect={() => {
        if (disabled) return;
        handleSelect(itemValue);
        onSelect?.();
      }}
      className={cn(
        'flex items-center gap-2',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {children}
      {isSelected && <Check className="ml-auto h-4 w-4 text-primary" />}
    </CommandItem>
  );
}
