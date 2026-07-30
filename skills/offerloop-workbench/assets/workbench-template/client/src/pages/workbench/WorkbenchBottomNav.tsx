import React from 'react';
import {
  CalendarDays,
  ChartNoAxesCombined,
  GraduationCap,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@client/src/lib/utils';

type WorkbenchSection = 'today' | 'applications' | 'practice' | 'tools';

interface WorkbenchSectionMeta {
  id: WorkbenchSection;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const WORKBENCH_SECTIONS: WorkbenchSectionMeta[] = [
  {
    id: 'today',
    label: '今日',
    title: '今日安排',
    description: '集中查看未来 7 天的笔试、测评与面试日程。',
    icon: CalendarDays,
  },
  {
    id: 'applications',
    label: '投递',
    title: '投递管理',
    description: '查看目标企业、投递进展和笔面试数据。',
    icon: ChartNoAxesCombined,
  },
  {
    id: 'practice',
    label: '训练',
    title: '求职训练',
    description: '完成简历深挖和产品 Sense 的针对性练习。',
    icon: GraduationCap,
  },
  {
    id: 'tools',
    label: '工具',
    title: '效率工具',
    description: '集中使用 NotebookLM 等效率工具辅助求职。',
    icon: Wrench,
  },
];

const isWorkbenchSection = (value: string | null): value is WorkbenchSection =>
  WORKBENCH_SECTIONS.some(
    (section: WorkbenchSectionMeta): boolean => section.id === value,
  );

const resolveWorkbenchSection = (value: string | null): WorkbenchSection =>
  isWorkbenchSection(value) ? value : 'today';

interface WorkbenchBottomNavProps {
  activeSection: WorkbenchSection;
  onSectionChange: (section: WorkbenchSection) => void;
}

const WorkbenchBottomNav: React.FC<WorkbenchBottomNavProps> = ({
  activeSection,
  onSectionChange,
}) => (
  <nav
    aria-label="工作台功能导航"
    className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-12px_35px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl md:bottom-4 md:left-[calc((100vw-var(--offerloop-agent-panel-width))/2)] md:right-auto md:w-[min(680px,calc(100vw-var(--offerloop-agent-panel-width)-2rem))] md:-translate-x-1/2 md:rounded-2xl md:border md:p-2 md:shadow-xl"
  >
    <div className="mx-auto grid max-w-2xl grid-cols-4 gap-1">
      {WORKBENCH_SECTIONS.map((section: WorkbenchSectionMeta) => {
        const Icon: LucideIcon = section.icon;
        const active: boolean = activeSection === section.id;
        return (
          <button
            key={section.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-label={`切换到${section.label}`}
            onClick={() => {
              onSectionChange(section.id);
            }}
            className={cn(
              'group flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            data-ai-section-type="button"
          >
            <Icon
              className={cn(
                'size-5 transition-transform group-active:scale-95',
                active ? 'stroke-[2.4]' : '',
              )}
            />
            <span>{section.label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);

export { WORKBENCH_SECTIONS, WorkbenchBottomNav, resolveWorkbenchSection };
export type { WorkbenchSection, WorkbenchSectionMeta };
