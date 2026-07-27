'use client';

import { useEntityComboboxContext } from '@client/src/components/business-ui/entity-combobox/context';
import { searchInputVariants } from '@client/src/components/business-ui/entity-combobox/size-variants';
import { cn } from '@/lib/utils';
import { CommandInput } from '@client/src/components/ui/command';

export type BaseComboboxSearchProps = {
  placeholder?: string;
  className?: string;
  ref?: React.Ref<HTMLInputElement>;
};

export const BaseComboboxSearch = ({
  placeholder = '搜索...',
  className,
  ref,
}: BaseComboboxSearchProps) => {
  const { searchValue, setSearchValue, size } = useEntityComboboxContext();

  return (
    <CommandInput
      ref={ref}
      autoFocus
      value={searchValue}
      onValueChange={setSearchValue}
      placeholder={placeholder}
      className={cn(searchInputVariants({ size }), className)}
    />
  );
};
