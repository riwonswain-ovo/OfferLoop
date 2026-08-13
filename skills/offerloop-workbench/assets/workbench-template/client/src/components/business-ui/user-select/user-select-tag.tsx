'use client';

import { X } from 'lucide-react';

import {
  tagCloseIconVariants,
  type ComboboxSize,
} from '@client/src/components/business-ui/entity-combobox/size-variants';
import type {
  AccountType,
  UserSelectItemValue,
} from '@client/src/components/business-ui/user-select/types';
import { UserPill } from '@client/src/components/business-ui/user-select/user-pill';
import { Skeleton } from '@client/src/components/ui/skeleton';

export const UserSelectTag = ({
  userValue,
  onClose,
  maxTextLength,
  className,
  size = 'medium',
  disabled,
  isLoading,
  accountType = 'apaas',
}: {
  userValue: UserSelectItemValue;
  onClose: (value: UserSelectItemValue, e: React.MouseEvent) => void;
  maxTextLength?: number;
  className?: string;
  size?: ComboboxSize;
  disabled?: boolean;
  /**
   * 是否正在加载用户信息（ID 模式下查询中）
   */
  isLoading?: boolean;
  /**
   * 账户类型，用于 UserProfile 展示
   */
  accountType?: AccountType;
}) => {
  const user = userValue.raw;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(userValue, e);
  };

  const closeButton = !disabled ? (
    <button
      type="button"
      className="rounded-sm text-foreground opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none"
      onClick={handleClose}
    >
      <X className={tagCloseIconVariants({ size })} />
      <span className="sr-only">移除 {userValue.name}</span>
    </button>
  ) : null;

  // 加载中状态显示 Skeleton（不触发 UserProfile）
  if (isLoading && !user) {
    return (
      <div className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3 w-12" />
      </div>
    );
  }

  return (
    <UserPill
      userId={userValue.id}
      accountType={accountType}
      label={userValue.name}
      avatarUrl={userValue.avatar || user?.avatar}
      className={className}
      maxTextLength={maxTextLength}
      suffix={closeButton}
      size={size}
      disabled={disabled}
    />
  );
};
