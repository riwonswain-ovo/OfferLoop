import type React from 'react';
import {
  BriefcaseBusiness,
  CalendarClock,
  GraduationCap,
  SearchCheck,
} from 'lucide-react';

interface QuickAction {
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: '整理招聘信息',
    prompt: '帮我检查并整理最近的招聘信息，先告诉我需要哪些确认。',
    icon: BriefcaseBusiness,
  },
  {
    label: '检查笔面试',
    prompt: '检查最近有没有新的笔试、测评或面试通知。',
    icon: CalendarClock,
  },
  {
    label: '准备面试',
    prompt: '基于我的当前简历和目标岗位，帮我制定面试准备计划。',
    icon: GraduationCap,
  },
  {
    label: '复盘面试',
    prompt: '读取我选定的面试 ASR，先确认目标后帮我完成复盘。',
    icon: SearchCheck,
  },
];

export { QUICK_ACTIONS };
export type { QuickAction };
