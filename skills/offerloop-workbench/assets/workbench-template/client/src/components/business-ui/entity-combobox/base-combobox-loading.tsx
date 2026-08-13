'use client';

import { cn } from '@/lib/utils';
import { Spinner } from '@client/src/components/ui/spinner';

export const BaseComboboxLoading = ({
  className,
}: {
  text?: string;
  className?: string;
}) => {
  return (
    <div
      className={cn('flex items-center justify-center gap-2 py-6', className)}
    >
      <Spinner className="size-4.5 text-primary" />
    </div>
  );
};
