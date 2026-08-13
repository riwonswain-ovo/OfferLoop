'use client';

import React, { useCallback } from 'react';

import { BaseComboboxEmpty } from '@client/src/components/business-ui/entity-combobox/base-combobox-empty';
import { BaseComboboxError } from '@client/src/components/business-ui/entity-combobox/base-combobox-error';
import { BaseComboboxLoading } from '@client/src/components/business-ui/entity-combobox/base-combobox-loading';
import { useEntityComboboxContext } from '@client/src/components/business-ui/entity-combobox/context';
import {
  skeletonAvatarVariants,
  skeletonItemVariants,
} from '@client/src/components/business-ui/entity-combobox/size-variants';
import type { ItemValue } from '@client/src/components/business-ui/entity-combobox/types';
import { CommandGroup, CommandList } from '@client/src/components/ui/command';
import { ScrollArea } from '@client/src/components/ui/scroll-area';
import { Skeleton } from '@client/src/components/ui/skeleton';

export type BaseComboboxListProps<T = unknown> = {
  renderItem: (
    item: T,
    isSelected: boolean,
    itemClassName?: string,
    disabled?: boolean,
  ) => React.ReactNode;
  getItemValue: (item: T) => ItemValue;
  /**
   * 判断选项是否禁用
   */
  getOptionDisabled?: (value: ItemValue) => boolean;
  emptyText?: string;
  loadingText?: string;
  classNames?: {
    list?: string;
    listItem?: string;
    empty?: string;
    loading?: string;
    error?: string;
  };
};

export function BaseComboboxList<T>({
  renderItem,
  getItemValue,
  getOptionDisabled,
  emptyText,
  loadingText,
  classNames = {},
}: BaseComboboxListProps<T>) {
  const {
    data,
    isFetching,
    selectedValue,
    debouncedSearch,
    isError,
    refetch,
    isSuccess,
    size,
  } = useEntityComboboxContext();

  const isItemSelected = useCallback(
    (item: T) => {
      const itemValue = getItemValue(item);
      if (Array.isArray(selectedValue)) {
        return selectedValue.some((v) => v.id === itemValue.id);
      }
      return selectedValue?.id === itemValue.id;
    },
    [getItemValue, selectedValue],
  );

  const isItemDisabled = useCallback(
    (item: T) => {
      if (!getOptionDisabled) return false;
      const itemValue = getItemValue(item);
      return getOptionDisabled(itemValue);
    },
    [getItemValue, getOptionDisabled],
  );

  const hasSearchQuery = debouncedSearch.trim() !== '';

  // 1. 没有搜索词时显示 placeholder
  const shouldShowPlaceHolder = !hasSearchQuery;
  // 2. 搜索出错时显示错误状态
  const shouldShowError = isError && hasSearchQuery;
  // 3. 首次搜索无已有数据时显示骨架屏
  const shouldShowSkeleton =
    isFetching && (data === undefined || data?.length === 0) && hasSearchQuery;
  // 4. 有已有内容触发搜索时显示蒙层 loading
  const shouldShowSpinner =
    isFetching && data !== undefined && data.length > 0 && hasSearchQuery;
  // 5. 搜索完成结果为空时显示空状态
  const shouldShowEmpty =
    !isFetching && isSuccess && data?.length === 0 && hasSearchQuery;

  const content = (() => {
    if (shouldShowPlaceHolder) {
      return (
        <BaseComboboxEmpty text={'请输入关键词'} className={classNames.empty} />
      );
    }

    if (shouldShowError) {
      return (
        <BaseComboboxError onRetry={refetch} className={classNames.error} />
      );
    }

    if (shouldShowSpinner) {
      return (
        <>
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-popover opacity-40">
            <BaseComboboxLoading
              text={loadingText}
              className={classNames.loading}
            />
          </div>
          {(data as T[]).map((item) =>
            renderItem(
              item,
              isItemSelected(item),
              classNames.listItem,
              isItemDisabled(item),
            ),
          )}
        </>
      );
    }

    if (shouldShowSkeleton) {
      return (
        <div className="absolute inset-0 overflow-hidden! bg-background p-1 py-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className={skeletonItemVariants({ size })}>
              <Skeleton className={skeletonAvatarVariants({ size })} />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (shouldShowEmpty) {
      return (
        <BaseComboboxEmpty text={emptyText} className={classNames.empty} />
      );
    }

    return ((data as T[]) ?? []).map((item) =>
      renderItem(
        item,
        isItemSelected(item),
        classNames.listItem,
        isItemDisabled(item),
      ),
    );
  })();

  return (
    <CommandList className={classNames.list} autoFocus>
      <div className="relative">
        <ScrollArea
          className={`max-h-[300px] [&>[data-radix-scroll-area-viewport]>div]:block! ${size === 'xs' ? 'min-h-[54px]' : 'min-h-[58px]'}`}
          onWheel={(e: React.WheelEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          <CommandGroup className="w-full">{content}</CommandGroup>
        </ScrollArea>
      </div>
    </CommandList>
  );
}
