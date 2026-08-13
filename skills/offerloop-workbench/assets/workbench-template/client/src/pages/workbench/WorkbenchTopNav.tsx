import React from 'react';

import offerLoopLogoUrl from '@client/src/assets/offerloop-logo-transparent.png';
import { cn } from '@client/src/lib/utils';

type WorkbenchPageId =
  | 'home'
  | 'applications'
  | 'materials'
  | 'interviews'
  | 'product-sense';

interface WorkbenchNavItem {
  id: WorkbenchPageId;
  label: string;
}

const WORKBENCH_NAV_ITEMS: WorkbenchNavItem[] = [
  { id: 'home', label: '工作台' },
  { id: 'applications', label: '投递管理' },
  { id: 'materials', label: '材料中心' },
  { id: 'interviews', label: '面试与复盘' },
  { id: 'product-sense', label: 'PM Sense' },
];

interface WorkbenchTopNavProps {
  activePage: WorkbenchPageId;
  onPageChange: (page: WorkbenchPageId) => void;
}

const WorkbenchTopNav: React.FC<WorkbenchTopNavProps> = ({
  activePage,
  onPageChange,
}) => (
  <header className="sticky top-0 z-20 flex h-[50px] items-stretch border-b border-[#E5E6EB] bg-white">
    <nav
      aria-label="OfferLoop 主导航"
      className="flex min-w-0 flex-1 items-stretch overflow-x-auto px-5"
    >
      {WORKBENCH_NAV_ITEMS.map((item: WorkbenchNavItem) => {
        const active: boolean = item.id === activePage;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onPageChange(item.id)}
            className={cn(
              'relative shrink-0 px-3.5 text-[13.5px] transition-colors',
              active
                ? 'font-semibold text-[#3370FF]'
                : 'text-[#646A73] hover:text-[#1F2329]',
            )}
          >
            {item.label}
            {active ? (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#3370FF]" />
            ) : null}
          </button>
        );
      })}
    </nav>

  </header>
);

interface WorkbenchBrandMarkProps {
  className?: string;
}

const WorkbenchBrandMark: React.FC<WorkbenchBrandMarkProps> = ({
  className,
}) => (
  <img
    src={offerLoopLogoUrl}
    alt="OfferLoop"
    className={cn(
      'size-9 shrink-0 object-contain',
      className,
    )}
  />
);

export {
  WORKBENCH_NAV_ITEMS,
  WorkbenchBrandMark,
  WorkbenchTopNav,
};
export type { WorkbenchPageId };
