'use client';

import React from 'react';

import {
  ItemPill,
  renderPillAvatar,
} from '@client/src/components/business-ui/entity-combobox/item-pill';
import type { ComboboxSize } from '@client/src/components/business-ui/entity-combobox/size-variants';
import type { AccountType } from '@client/src/components/business-ui/user-select/types';

export type UserPillProps = {
  /**
   * 用户 ID；保留用于兼容已有调用方，不触发远程资料加载
   */
  userId: string;

  /**
   * 账户类型；保留用于兼容已有调用方
   */
  accountType?: AccountType;

  /**
   * 显示的用户名
   */
  label: string;

  /**
   * 头像 URL
   */
  avatarUrl?: string;

  /**
   * 尺寸
   * @default "medium"
   */
  size?: ComboboxSize;

  /**
   * 是否禁用
   */
  disabled?: boolean;

  /**
   * 最大文本长度
   */
  maxTextLength?: number;

  /**
   * 后缀（如关闭按钮）
   */
  suffix?: React.ReactNode;

  /**
   * 自定义样式
   */
  className?: string;

  /**
   * 已弃用；模板不再加载远程 UserProfile
   */
  enableProfile?: false;

  avatarFallback?: boolean;
};

export const UserPill: React.FC<UserPillProps> = ({
  label,
  avatarUrl,
  size = 'medium',
  disabled,
  maxTextLength,
  suffix,
  className,
  avatarFallback,
}) => {
  const baseAvatarElement = renderPillAvatar({
    avatarUrl,
    label,
    size,
    avatarFallback,
  });

  return (
    <ItemPill
      label={label}
      avatar={baseAvatarElement}
      className={className}
      maxTextLength={maxTextLength}
      suffix={suffix}
      size={size}
      disabled={disabled}
      avatarFallback={avatarFallback}
    />
  );
};
