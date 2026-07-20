'use client';

import React from 'react';

import type { Chat } from '@client/src/components/business-ui/chat-select/types';
import { BaseComboboxItem } from '@client/src/components/business-ui/entity-combobox/base-combobox-item';
import { HighlightText } from '@client/src/components/business-ui/entity-combobox/highlight-text';
import { isHexColor } from '@client/src/components/business-ui/entity-combobox/item-pill';
import {
  listItemAvatarVariants,
  listItemNameVariants,
  listItemSubTextVariants,
  listItemVariants,
  type ComboboxSize,
} from '@client/src/components/business-ui/entity-combobox/size-variants';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const ExternalChatTag = () => (
  <span className="inline-flex shrink-0 items-center rounded-sm bg-blue-500/20 px-1.5 py-0.5 text-xs leading-4 text-blue-900 dark:text-blue-200">
    外部
  </span>
);

export const ChatItem = ({
  chatValue,
  isSelected,
  className,
  size = 'medium',
  searchKeyword,
  disabled,
}: {
  chatValue: Chat;
  isSelected: boolean;
  className?: string;
  size?: ComboboxSize;
  searchKeyword?: string;
  disabled?: boolean;
}) => {
  const chat = chatValue.raw;
  const displayName = chat?.name?.zh_cn || chat?.name?.en_us || chatValue.name;
  const userCount = chat?.userCount;
  const isExternal = chat?.isExternal;

  const isHex = isHexColor(chat?.avatar);

  const avatarImage = !isHex ? (
    <AvatarImage src={chat?.avatar} alt={displayName} loading="eager" />
  ) : (
    <AvatarFallback style={{ backgroundColor: chat?.avatar }}>
      {displayName?.charAt?.(0).toUpperCase()}
    </AvatarFallback>
  );

  return (
    <BaseComboboxItem
      item={chatValue}
      getItemValue={(item) => item}
      isSelected={isSelected}
      className={cn(listItemVariants({ size }), className)}
      disabled={disabled}
    >
      <Avatar className={listItemAvatarVariants({ size })}>
        {chat?.avatar ? (
          avatarImage
        ) : (
          <AvatarFallback>{displayName?.charAt?.(0)}</AvatarFallback>
        )}
      </Avatar>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <HighlightText
          text={chatValue.name}
          highlight={searchKeyword}
          className={cn(listItemNameVariants({ size }), 'truncate')}
        />
        {userCount != null && (
          <span className={cn(listItemSubTextVariants({ size }), 'shrink-0')}>
            ({userCount})
          </span>
        )}
        {isExternal && <ExternalChatTag />}
      </div>
    </BaseComboboxItem>
  );
};
