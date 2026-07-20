'use client';

import { useMemo } from 'react';

import { searchDepartments } from '@client/src/components/business-ui/api/departments/service';
import { DepartmentItem } from '@client/src/components/business-ui/department-select/department-item';
import { DepartmentSelectTag } from '@client/src/components/business-ui/department-select/department-select-tag';
import type {
  Department,
  DepartmentSelectProps,
} from '@client/src/components/business-ui/department-select/types';
import { departmentInfoToDepartment } from '@client/src/components/business-ui/department-select/utils';
import { BaseCombobox } from '@client/src/components/business-ui/entity-combobox/base-combobox';
import { useEntityComboboxContext } from '@client/src/components/business-ui/entity-combobox/context';

function createDepartmentsFetcher(pageSize = 100) {
  return async (search: string) => {
    const response = await searchDepartments({ query: search, pageSize });
    const departmentList = response?.data?.departmentList || [];

    return {
      items: departmentList.map(departmentInfoToDepartment),
    };
  };
}

// 内部包装组件用于获取 context 中的 size
const DepartmentItemWrapper = ({
  departmentValue,
  isSelected,
  className,
  disabled,
}: {
  departmentValue: Department;
  isSelected: boolean;
  className?: string;
  disabled?: boolean;
}) => {
  const { size, searchValue } = useEntityComboboxContext();
  return (
    <DepartmentItem
      departmentValue={departmentValue}
      isSelected={isSelected}
      className={className}
      size={size}
      searchKeyword={searchValue}
      disabled={disabled}
    />
  );
};

const DepartmentSelectTagWrapper = ({
  departmentValue,
  onClose,
  className,
  disabled,
}: {
  departmentValue: Department;
  onClose: (value: Department, e: React.MouseEvent) => void;
  className?: string;
  disabled?: boolean;
}) => {
  const { size } = useEntityComboboxContext();
  return (
    <DepartmentSelectTag
      departmentValue={departmentValue}
      onClose={onClose}
      className={className}
      size={size}
      disabled={disabled}
    />
  );
};

export const DepartmentSelect = (props: DepartmentSelectProps) => {
  const {
    size = 'medium',
    triggerType = 'button',
    renderTrigger,
    multiple,
    value,
    defaultValue,
    onChange,
    defaultOpen,
    disabled,
    autoFocus,
    required,
    name,
    className,
    classNames,
    placeholder = '请选择部门',
    emptyText = '没有匹配结果，换个关键词试试吧',
    tagClosable,
    maxTagCount,
    onSelect,
    onDeselect,
    onClear,
    onFocus,
    onBlur,
    slotProps,
    getOptionDisabled,
  } = props;

  const fetchFn = useMemo(() => createDepartmentsFetcher(), []);

  return (
    <BaseCombobox
      classNames={classNames}
      fetchFn={fetchFn}
      size={size}
      triggerType={triggerType}
      renderTrigger={renderTrigger}
      multiple={multiple}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      defaultOpen={defaultOpen}
      disabled={disabled}
      autoFocus={autoFocus}
      required={required}
      name={name}
      className={className}
      placeholder={placeholder}
      emptyText={emptyText}
      tagClosable={tagClosable}
      maxTagCount={maxTagCount}
      onSelect={onSelect}
      onDeselect={onDeselect}
      onClear={onClear}
      onFocus={onFocus}
      onBlur={onBlur}
      showSearch
      searchPlaceholder=""
      debounce={300}
      getItemValue={(departmentValue) => departmentValue}
      getItemLabel={(departmentValue) => departmentValue.name}
      getOptionDisabled={getOptionDisabled}
      renderItem={(
        departmentValue,
        isSelected,
        itemClassName,
        itemDisabled,
      ) => (
        <DepartmentItemWrapper
          key={departmentValue.id}
          departmentValue={departmentValue}
          isSelected={isSelected}
          className={itemClassName}
          disabled={itemDisabled}
        />
      )}
      renderTag={(departmentValue, onClose, tagDisabled) => (
        <DepartmentSelectTagWrapper
          key={departmentValue.id}
          departmentValue={departmentValue}
          onClose={onClose}
          disabled={tagDisabled}
        />
      )}
      slotProps={slotProps}
    />
  );
};

export type {
  DepartmentInfo,
  Department,
} from '@client/src/components/business-ui/department-select/types';
