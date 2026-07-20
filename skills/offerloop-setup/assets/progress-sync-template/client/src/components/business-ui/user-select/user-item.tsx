'use client';

import { Loader2 } from 'lucide-react';

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
import type { UserSelectItemValue } from '@client/src/components/business-ui/user-select/types';
import { cn } from '@/lib/utils';
import { getI18nText } from '@client/src/components/business-ui/utils/user';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@client/src/components/ui/avatar';

const ExternalUserTag = () => (
  <span className="dark:blue-200 inline-flex shrink-0 items-center rounded-sm bg-blue-500/20 px-1.5 py-0.5 text-xs leading-4 text-blue-900">
    外部
  </span>
);

export const UserItem = ({
  userValue,
  isSelected,
  className,
  size = 'medium',
  searchKeyword,
  disabled,
  isConverting,
}: {
  userValue: UserSelectItemValue;
  isSelected: boolean;
  className?: string;
  size?: ComboboxSize;
  searchKeyword?: string;
  disabled?: boolean;
  isConverting?: boolean;
}) => {
  const user = userValue.raw;
  const displayName = getI18nText(user?.name);
  const isExternalUser = user?.user_type === '_externalUser';

  const isHex = isHexColor(user?.avatar);

  const avatarImage = !isHex ? (
    <AvatarImage src={user?.avatar} alt={displayName} loading="eager" />
  ) : (
    <AvatarFallback style={{ backgroundColor: user?.avatar }}>
      {displayName?.charAt?.(0).toUpperCase()}
    </AvatarFallback>
  );

  return (
    <BaseComboboxItem
      item={userValue}
      getItemValue={(item) => item}
      isSelected={isSelected}
      className={cn(listItemVariants({ size }), className)}
      disabled={disabled}
    >
      <div className="relative shrink-0">
        <Avatar className={listItemAvatarVariants({ size })}>
          {user?.avatar ? (
            avatarImage
          ) : (
            <AvatarFallback>{displayName?.charAt?.(0)}</AvatarFallback>
          )}
        </Avatar>
        {isConverting && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <div className="flex items-center gap-1">
          <HighlightText
            text={userValue.name}
            highlight={searchKeyword}
            className={listItemNameVariants({ size })}
          />
          {isExternalUser && <ExternalUserTag />}
        </div>
        <span className={listItemSubTextVariants({ size })}>
          {getI18nText(user?.department?.name) || user?.tenantName}
        </span>
      </div>
    </BaseComboboxItem>
  );
};
