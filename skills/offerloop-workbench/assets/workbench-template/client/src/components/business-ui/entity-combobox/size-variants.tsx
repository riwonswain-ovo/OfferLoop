import { cva } from 'class-variance-authority';

/**
 * Combobox 尺寸类型
 * - medium: 默认大小，适用于大多数场景
 * - small: 较小尺寸
 * - xs: 最小尺寸
 */
export type ComboboxSize = 'medium' | 'small' | 'xs';

/**
 * Search 模式下的搜索框容器样式
 * medium: 高度36px, padding上下6px左右6px
 * small: 高度32px, padding上下4px左右4px
 * xs: 高度28px, padding上下4px左右4px
 */
export const searchTriggerVariants = cva(
  [
    'border-input bg-background',
    'flex w-full cursor-pointer items-center gap-1 rounded-md border',
    'hover:border-ring',
    'focus-visible:ring-3 focus-visible:ring-ring/20',
    'data-[state=open]:ring-3 data-[state=open]:ring-ring/20',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'focus-visible:border-ring focus-visible:outline-none data-[state=open]:border-ring',
  ],
  {
    variants: {
      size: {
        medium: 'min-h-9 px-3 py-1.5 text-sm', // 36px, padding 12px
        small: 'min-h-8 px-3 py-1 text-sm', // 32px, padding 12px
        xs: 'min-h-7 px-2 py-1 text-xs', // 28px, padding 8px
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  },
);

/**
 * Search 模式下输入框文字样式
 * medium/small: text-sm
 * xs: text-xs
 */
export const searchInputVariants = cva('', {
  variants: {
    size: {
      medium: 'text-sm',
      small: 'text-sm',
      xs: 'text-xs',
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * Search 模式下的标签样式
 * medium/small: 高度24px, 头像20px, 文字text-sm line-height 22px
 * xs: 高度20px, 头像16px, 文字text-xs line-height 16px
 */
export const searchTagVariants = cva('gap-1 pr-1 font-normal', {
  variants: {
    size: {
      medium: 'h-6 text-sm leading-[22px]', // 24px
      small: 'h-6 text-sm leading-[22px]', // 24px
      xs: 'h-5 text-xs leading-4', // 20px
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * 标签内头像尺寸
 * medium/small: 20px
 * xs: 16px
 */
export const tagAvatarVariants = cva('', {
  variants: {
    size: {
      medium: 'size-5', // 20px
      small: 'size-5', // 20px
      xs: 'size-4', // 16px
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * 标签内图标尺寸 (如部门图标)
 * medium/small: 16px
 * xs: 12px
 */
export const tagIconVariants = cva('', {
  variants: {
    size: {
      medium: 'size-5', // 16px
      small: 'size-5', // 16px
      xs: 'size-4', // 12px
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * 标签内关闭按钮图标尺寸
 */
export const tagCloseIconVariants = cva('text-foreground', {
  variants: {
    size: {
      medium: 'size-2.5', // 10px
      small: 'size-2.5', // 10px
      xs: 'size-2', // 8px
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * Button 模式下的添加按钮样式
 * medium/small: 24px
 * xs: 16px
 */
export const addButtonVariants = cva(
  [
    'shrink-0 rounded-full p-0',
    'bg-neutral-700/10 hover:bg-neutral-700/20! dark:bg-neutral-500/10 dark:hover:bg-neutral-500/20!',
    'data-[state=open]:bg-neutral-700/20 dark:data-[state=open]:bg-neutral-500/20',
  ],
  {
    variants: {
      size: {
        medium: 'size-6', // 24px
        small: 'size-6', // 24px
        xs: 'size-4', // 16px
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  },
);

/**
 * Button 模式下的加号图标尺寸
 */
export const addButtonIconVariants = cva('', {
  variants: {
    size: {
      medium: 'size-4', // 16px
      small: 'size-4', // 16px
      xs: 'size-2', // 8px
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * 列表项容器样式
 * medium/small: 高度50px
 * xs: 高度46px
 */
export const listItemVariants = cva('flex items-center gap-2', {
  variants: {
    size: {
      medium: 'h-[50px] py-2', // 50px
      small: 'h-[50px] py-2', // 50px
      xs: 'h-[46px] py-1.5', // 46px
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * 列表项头像尺寸
 * medium/small: 32px
 * xs: 28px
 */
export const listItemAvatarVariants = cva('', {
  variants: {
    size: {
      medium: 'size-8', // 32px
      small: 'size-8', // 32px
      xs: 'size-7', // 28px
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * 列表项名称文字样式
 * medium/small: text-sm, line-height 22px
 * xs: text-xs, line-height 16px
 */
export const listItemNameVariants = cva('truncate', {
  variants: {
    size: {
      medium: 'text-sm leading-[22px]',
      small: 'text-sm leading-[22px]',
      xs: 'text-xs leading-4',
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});

/**
 * 列表项副文本样式 (如 userId)
 * 所有尺寸: text-xs, line-height 16px
 */
export const listItemSubTextVariants = cva(
  'truncate leading-4 text-muted-foreground',
  {
    variants: {
      size: {
        medium: 'text-xs',
        small: 'text-xs',
        xs: 'text-[10px]',
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  },
);

/**
 * ItemPill 标签组件样式 (用于 tag 渲染)
 */
export const itemPillVariants = cva(
  [
    'w-fit gap-1 rounded-full border-0 bg-[#E8E8E9] font-normal dark:bg-[#3D3E3E]',
    'pt-px pb-px pl-0.5',
  ],
  {
    variants: {
      size: {
        medium: 'h-[22px] pr-2 text-sm leading-5 [&>svg]:size-5', // 24px
        small: 'h-[22px] pr-2 text-sm leading-5 [&>svg]:size-5', // 24px
        xs: 'h-5 pr-1.5 text-xs leading-4 [&>svg]:size-4', // 20px
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  },
);

/**
 * ItemPill 内文本样式
 */
export const itemPillTextVariants = cva(
  'max-w-[120px] truncate text-foreground',
  {
    variants: {
      size: {
        medium: 'text-sm leading-5',
        small: 'text-sm leading-5',
        xs: 'text-xs leading-4',
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  },
);

/**
 * 列表骨架屏项容器样式 (与 listItemVariants 保持一致)
 * medium/small: 高度50px
 * xs: 高度46px
 */
export const skeletonItemVariants = cva(
  'flex items-center gap-2 rounded-sm px-2',
  {
    variants: {
      size: {
        medium: 'h-[50px] py-3.5', // 50px
        small: 'h-[50px] py-3.5', // 50px
        xs: 'h-[46px] py-1.5', // 46px
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  },
);

/**
 * 列表骨架屏头像尺寸 (与 listItemAvatarVariants 保持一致)
 * medium/small: 32px
 * xs: 28px
 */
export const skeletonAvatarVariants = cva('rounded-full', {
  variants: {
    size: {
      medium: 'size-8', // 32px
      small: 'size-8', // 32px
      xs: 'size-7', // 28px
    },
  },
  defaultVariants: {
    size: 'medium',
  },
});
