'use client';

import React from 'react';

import {
  itemPillTextVariants,
  itemPillVariants,
  tagAvatarVariants,
  type ComboboxSize,
} from '@client/src/components/business-ui/entity-combobox/size-variants';
import { cn } from '@/lib/utils';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@client/src/components/ui/avatar';
import { Badge } from '@client/src/components/ui/badge';

export type ItemPillProps = {
  /**
   * 显示的文本
   */
  label: string;

  /**
   * 尺寸
   * @default "medium"
   */
  size?: ComboboxSize;

  /**
   * 头像 URL
   */
  avatarUrl?: string;

  /**
   * 头像内容（用于自定义头像显示）
   */
  avatar?: React.ReactNode;

  /**
   * 是否显示头像占位符（当没有头像 URL 时显示）
   * @default false
   *
   */
  avatarFallback?: boolean;

  /**
   * 自定义样式
   */
  className?: string;
  /**
   * 是否禁用
   */
  disabled?: boolean;
  /**
   * 最大文本长度
   */
  maxTextLength?: number;

  /**
   * 后缀
   */
  suffix?: React.ReactNode;
};

// 检查是否是 16 进制 RGB 颜色（如 #RRGGBB 或 #RGB）
export const isHexColor = (str?: string): boolean => {
  if (!str) return false;
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(str);
};

/**
 * renderPillAvatar 的参数类型
 */
export type RenderPillAvatarOptions = {
  /**
   * 头像 URL
   */
  avatarUrl?: string;
  /**
   * 显示的文本（用于 fallback 首字母）
   */
  label: string;
  /**
   * 尺寸
   * @default "medium"
   */
  size?: ComboboxSize;
  /**
   * 是否显示头像占位符（当没有头像 URL 时显示）
   * @default true
   */
  avatarFallback?: boolean;
};

/**
 * 渲染 Pill 头像的辅助函数
 * 可被其他组件复用（如 UserPill）
 */
export const renderPillAvatar = ({
  avatarUrl,
  label,
  size = 'medium',
  avatarFallback = true,
}: RenderPillAvatarOptions): React.ReactNode => {
  if (avatarUrl) {
    // 如果是 16 进制颜色，渲染带背景色的头像和用户名首字
    if (isHexColor(avatarUrl)) {
      return (
        <Avatar className={tagAvatarVariants({ size })}>
          <AvatarFallback style={{ backgroundColor: avatarUrl }}>
            {label?.charAt?.(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      );
    }
    return (
      <Avatar className={tagAvatarVariants({ size })}>
        <AvatarImage src={avatarUrl} alt={label} loading="eager" />
      </Avatar>
    );
  }

  if (avatarFallback) {
    return (
      <Avatar className={tagAvatarVariants({ size })}>
        <AvatarFallback>{label?.charAt?.(0).toUpperCase()}</AvatarFallback>
      </Avatar>
    );
  }

  return null;
};

export const ItemPill: React.FC<ItemPillProps> = ({
  className,
  avatarUrl,
  disabled,
  label,
  maxTextLength,
  suffix,
  avatar,
  avatarFallback = true,
  size = 'medium',
}) => {
  const displayLabel = React.useMemo(() => {
    if (!maxTextLength || label?.length <= maxTextLength) {
      return label;
    }
    return label.slice(0, maxTextLength) + '...';
  }, [maxTextLength, label]);

  const avatarElement = React.useMemo(() => {
    if (avatar) {
      return avatar;
    }

    return renderPillAvatar({ avatarUrl, label, size, avatarFallback });
  }, [avatar, avatarUrl, avatarFallback, label, size]);

  return (
    <Badge
      variant="secondary"
      className={cn(
        itemPillVariants({ size }),
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {/* 头像 */}
      {avatarElement}
      {/* 文本 */}
      <span className={itemPillTextVariants({ size })}>{displayLabel}</span>

      {suffix}
    </Badge>
  );
};
