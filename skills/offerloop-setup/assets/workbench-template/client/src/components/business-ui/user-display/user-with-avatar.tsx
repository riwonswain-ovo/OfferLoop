'use client';
import React from 'react';

import { useMemo } from 'react';

import { OverflowTooltipText } from '@client/src/components/business-ui/user-display/overflow-tooltip-text';
import { type UserWithAvatarProps } from '@client/src/components/business-ui/user-display/type';
import {
  userInfoToUser,
  createUnknownUser,
} from '@client/src/components/business-ui/user-display/utils';
import { normalizeUser, getI18nText } from '@client/src/components/business-ui/utils/user';
import type { User } from '@client/src/components/business-ui/types/user';
import { useUsersByIds } from '@client/src/components/business-ui/api/users/queries';
import { cn } from '@/lib/utils';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@client/src/components/ui/avatar';
import { cva } from 'class-variance-authority';

const userWithAvatarVariants = cva(
  'flex min-w-0 items-center gap-1 rounded-full',
  {
    variants: {
      size: {
        small: 'max-w-37',
        medium: 'max-w-43',
        large: 'max-w-49',
      },
      showLabel: {
        true: '',
        false: '',
      },
      mode: {
        tag: 'bg-muted',
        plain: '',
      },
    },
    compoundVariants: [
      { size: 'small', showLabel: true, class: 'py-0.5 pr-1.5 pl-0.5' },
      { size: 'medium', showLabel: true, class: 'py-0.5 pr-2 pl-0.5' },
      { size: 'large', showLabel: true, class: 'py-1 pr-2.5 pl-1' },
      { size: 'small', showLabel: false, class: '' },
      { size: 'medium', showLabel: false, class: '' },
      { size: 'large', showLabel: false, class: '' },
    ],
    defaultVariants: {
      size: 'medium',
      mode: 'tag',
      showLabel: true,
    },
  },
);

const avatarVariants = cva('', {
  variants: {
    size: {
      small: 'h-4 w-4',
      medium: 'h-5 w-5',
      large: 'h-6 w-6',
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

const avatarFallbackVariants = cva('leading-none text-foreground', {
  variants: {
    size: {
      small: 'text-[10px]',
      medium: 'text-[12px]',
      large: 'text-[14px]',
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

const textVariants = cva('text-card-foreground', {
  variants: {
    size: {
      small: 'text-[12px] leading-4',
      medium: 'text-[14px] leading-5',
      large: 'text-[16px] leading-6',
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

export function UserWithAvatar({
  data,
  size = 'medium',
  mode = 'tag',
  className,
  showLabel = true,
  accountType = 'apaas',
}: UserWithAvatarProps) {
  // 统一转换为标准 User 类型
  const user: User = normalizeUser(data);
  const { user_id, avatar: propsAvatar, name: propsName } = user;

  // 判断是否需要从 API 获取用户信息
  const needsFetch = !propsName && !propsAvatar && !!user_id;

  // 使用 react-query hook 获取用户信息
  const idsToFetch = useMemo(
    () => (needsFetch ? [user_id] : []),
    [needsFetch, user_id],
  );
  const { data: response, isLoading } = useUsersByIds(idsToFetch, accountType);

  // 从原始 API 响应中提取并转换用户信息
  const fetchedUser = useMemo(() => {
    if (!needsFetch) return null;
    const userInfoMap = response?.data?.userInfoMap || {};
    const userInfo = userInfoMap[user_id];
    return userInfo
      ? userInfoToUser(userInfo, accountType)
      : createUnknownUser(user_id);
  }, [response, needsFetch, user_id, accountType]);

  const avatar = propsAvatar || fetchedUser?.avatar;
  const name = propsName || fetchedUser?.name;

  // 直接使用已合并的 name，通过 getI18nText 处理国际化
  const displayName = isLoading ? '' : (getI18nText(name) || '无效人员');
  const formatSize = ['small', 'medium', 'large'].includes(size)
    ? size
    : 'medium';

  return (
    <div
      className={cn(
        userWithAvatarVariants({ size: formatSize, showLabel, mode }),
        className,
      )}
    >
      <Avatar className={cn(avatarVariants({ size: formatSize }))}>
        <AvatarImage className="m-0" src={avatar} alt={displayName} />
        <AvatarFallback
          className={cn(avatarFallbackVariants({ size: formatSize }))}
        />
      </Avatar>
      {showLabel && (
        <OverflowTooltipText
          text={displayName}
          className={cn(textVariants({ size: formatSize }))}
        />
      )}
    </div>
  );
}
