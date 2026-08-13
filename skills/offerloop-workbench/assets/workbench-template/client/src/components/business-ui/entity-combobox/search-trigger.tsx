'use client';

import { ChevronDown, ChevronUp, CircleX, X } from 'lucide-react';

import { useEntityComboboxContext } from '@client/src/components/business-ui/entity-combobox/context';
import {
  searchTagVariants,
  searchTriggerVariants,
  tagCloseIconVariants,
  type ComboboxSize,
} from '@client/src/components/business-ui/entity-combobox/size-variants';
import type {
  ClassNamesConfig,
  ItemValue,
} from '@client/src/components/business-ui/entity-combobox/types';
import { cn } from '@/lib/utils';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@client/src/components/ui/tooltip';

export type SearchTriggerProps = {
  size?: ComboboxSize;
  placeholder?: string;
  maxTagCount?: number | 'responsive';
  maxTagTextLength?: number;
  tagClosable?: boolean;
  classNames?: ClassNamesConfig;
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
  /**
   * 自定义渲染单个标签
   * @param value 标签的值对象
   * @param onClose 关闭标签的回调
   * @param disabled 是否禁用
   * @returns ReactNode
   */
  renderTag?: (
    value: ItemValue,
    onClose: (value: ItemValue, e: React.MouseEvent) => void,
    disabled?: boolean,
  ) => React.ReactNode;
  /**
   * 判断选项是否禁用
   */
  getOptionDisabled?: (value: ItemValue) => boolean;
  ref?: React.Ref<HTMLDivElement>;
};

export const SearchTrigger = ({
  size = 'medium',
  placeholder = '请选择',
  maxTagCount,
  maxTagTextLength,
  tagClosable = true,
  classNames,
  onFocus,
  onBlur,
  renderTag,
  getOptionDisabled,
  ref,
}: SearchTriggerProps) => {
  const {
    selectedValue,
    multiple,
    handleDeselect,
    handleClear,
    open,
    disabled,
  } = useEntityComboboxContext();

  const selectedArray = Array.isArray(selectedValue) ? selectedValue : [];

  // 计算显示的标签
  const getDisplayTags = () => {
    if (!multiple) return [];

    if (typeof maxTagCount === 'number') {
      return selectedArray.slice(0, maxTagCount);
    }

    // TODO: responsive 模式需要根据容器宽度计算
    return selectedArray;
  };

  const displayTags = getDisplayTags();
  const hiddenCount =
    multiple && typeof maxTagCount === 'number'
      ? Math.max(0, selectedArray.length - maxTagCount)
      : 0;

  const hiddenTags =
    multiple && typeof maxTagCount === 'number'
      ? selectedArray.slice(maxTagCount)
      : [];

  const handleTagClose = (value: ItemValue, e: React.MouseEvent) => {
    e.stopPropagation();
    if (getOptionDisabled?.(value)) return;
    if (!multiple) {
      handleClear(); // 单选模式清空
    } else {
      handleDeselect(value); // 多选模式删除指定项
    }
  };

  const truncateText = (text: string) => {
    if (!maxTagTextLength || text.length <= maxTagTextLength) {
      return text;
    }
    return text.slice(0, maxTagTextLength) + '...';
  };

  // 单选模式下显示选中值
  const displayValue =
    !multiple && selectedValue && !Array.isArray(selectedValue)
      ? selectedValue.name
      : '';

  return (
    <div
      ref={ref}
      tabIndex={disabled ? -1 : 0}
      role="combobox"
      aria-expanded={open}
      aria-controls="combobox-content"
      aria-disabled={disabled}
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'group',
        searchTriggerVariants({ size }),
        disabled && 'cursor-not-allowed bg-muted hover:border-input',
        classNames?.trigger,
      )}
      onFocus={disabled ? undefined : onFocus}
      onBlur={disabled ? undefined : onBlur}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {!multiple && displayValue ? (
          renderTag ? (
            renderTag(
              selectedValue as ItemValue,
              handleTagClose,
              getOptionDisabled?.(selectedValue as ItemValue),
            )
          ) : (
            <span className="truncate">{displayValue}</span>
          )
        ) : multiple && selectedArray.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {displayTags.map((value) =>
              renderTag ? (
                renderTag(value, handleTagClose, getOptionDisabled?.(value))
              ) : (
                <Badge
                  key={value.id}
                  variant="secondary"
                  className={cn(searchTagVariants({ size }), classNames?.tag)}
                >
                  <span>{truncateText(value.name)}</span>
                  {tagClosable && (
                    <button
                      type="button"
                      className="ml-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
                      onClick={(e) => handleTagClose(value, e)}
                    >
                      <X className={tagCloseIconVariants({ size })} />
                    </button>
                  )}
                </Badge>
              ),
            )}
            {hiddenCount > 0 && (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className={cn(
                      searchTagVariants({ size }),
                      'cursor-pointer',
                    )}
                  >
                    +{hiddenCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="w-auto max-w-80 p-2" align="start">
                  <div className="flex flex-wrap gap-1">
                    {hiddenTags.map((value) =>
                      renderTag ? (
                        renderTag(
                          value,
                          handleTagClose,
                          getOptionDisabled?.(value),
                        )
                      ) : (
                        <Badge
                          key={value.id}
                          variant="secondary"
                          className={cn(
                            searchTagVariants({ size }),
                            classNames?.tag,
                          )}
                        >
                          <span>{truncateText(value.name)}</span>
                          {tagClosable && (
                            <button
                              type="button"
                              className="ml-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
                              onClick={(e) => handleTagClose(value, e)}
                            >
                              <X className={tagCloseIconVariants({ size })} />
                            </button>
                          )}
                        </Badge>
                      ),
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </div>

      {selectedArray.length > 0 && (
        <Button
          variant="ghost"
          size="icon"
          data-slot="combobox-clear"
          disabled={disabled}
          aria-disabled={disabled}
          className={cn(
            'flex h-4 w-4 items-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 not-disabled:hover:bg-transparent not-disabled:hover:text-primary aria-disabled:opacity-0',
            classNames?.clear,
          )}
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
        >
          <>
            <CircleX className="h-3! w-3!" />
            <span className="sr-only">Clear all</span>
          </>
        </Button>
      )}

      <div className={cn('ml-1', classNames?.suffix)}>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 opacity-50" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        )}
      </div>
    </div>
  );
};
