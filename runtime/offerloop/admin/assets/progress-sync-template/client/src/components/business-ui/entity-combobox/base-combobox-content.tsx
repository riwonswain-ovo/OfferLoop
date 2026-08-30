'use client';

import { type PopoverSlotProps } from '@client/src/components/business-ui/entity-combobox/shared-types';
import { cn } from '@/lib/utils';
import { Command } from '@client/src/components/ui/command';
import { PopoverContent } from '@client/src/components/ui/popover';

export const BaseComboboxContent = ({
  children,
  className,
  side,
  align,
  sideOffset,
  popoverProps,
}: {
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  popoverProps?: PopoverSlotProps['popover'];
}) => {
  return (
    <PopoverContent
      className={cn('w-[270px] p-0', className)}
      side={side}
      align={align}
      sideOffset={sideOffset}
      forceMount
      {...popoverProps}
    >
      <Command shouldFilter={false}>{children}</Command>
    </PopoverContent>
  );
};
