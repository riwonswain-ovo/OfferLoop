'use client';

import { IconDepartment } from '@client/src/components/business-ui/department-select/icon-department';
import type { Department } from '@client/src/components/business-ui/department-select/types';
import { BaseComboboxItem } from '@client/src/components/business-ui/entity-combobox/base-combobox-item';
import { HighlightText } from '@client/src/components/business-ui/entity-combobox/highlight-text';
import {
  listItemAvatarVariants,
  listItemNameVariants,
  listItemVariants,
  type ComboboxSize,
} from '@client/src/components/business-ui/entity-combobox/size-variants';
import { cn } from '@/lib/utils';

export const DepartmentItem = ({
  departmentValue,
  isSelected,
  className,
  size = 'medium',
  searchKeyword,
  disabled,
}: {
  departmentValue: Department;
  isSelected: boolean;
  className?: string;
  size?: ComboboxSize;
  searchKeyword?: string;
  disabled?: boolean;
}) => {
  return (
    <BaseComboboxItem
      item={departmentValue}
      getItemValue={(item) => item}
      isSelected={isSelected}
      className={cn(listItemVariants({ size }), className)}
      disabled={disabled}
    >
      <div
        className={cn(
          'flex items-center justify-center',
          listItemAvatarVariants({ size }),
        )}
      >
        <IconDepartment className={listItemAvatarVariants({ size })} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <HighlightText
          text={departmentValue.name}
          highlight={searchKeyword}
          className={listItemNameVariants({ size })}
        />
      </div>
    </BaseComboboxItem>
  );
};
