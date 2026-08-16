import dayjs, { type Dayjs } from 'dayjs';

import type { BaseCellValue, WorkbenchRecord } from '@shared/api.interface';

import type { HomeScheduleItem } from './home-schedule';

const WEEKDAY_LABELS: string[] = [
  '周日',
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
];

interface HomeReadinessCheck {
  key: 'jd' | 'resume' | 'prepDoc';
  label: string;
  ready: boolean;
}

interface HomeTimelineDay {
  key: string;
  dateLabel: string;
  weekdayLabel: string;
  isToday: boolean;
  items: HomeScheduleItem[];
}

interface HomeScheduleSummary {
  total: number;
  interviews: number;
  exams: number;
  calendarOnly: number;
}

const cellText = (value: BaseCellValue | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(cellText).filter(Boolean).join('、');
  }
  for (const key of ['text', 'name', 'label', 'value']) {
    const text: string = cellText(value[key]);
    if (text) {
      return text;
    }
  }
  return '';
};

const readRecordText = (
  record: WorkbenchRecord,
  fieldName: string,
): string => cellText(record.fields[fieldName]).trim();

const parseRecordDate = (
  record: WorkbenchRecord,
  fieldName: string,
): Dayjs | null => {
  const text: string = cellText(record.fields[fieldName]);
  if (!text) {
    return null;
  }
  const numeric: number = Number(text);
  const parsed: Dayjs = Number.isFinite(numeric) ? dayjs(numeric) : dayjs(text);
  return parsed.isValid() ? parsed : null;
};

const hasRecordValue = (
  record: WorkbenchRecord | undefined,
  fieldName: string,
): boolean => Boolean(record && readRecordText(record, fieldName));

/**
 * 与「面试与复盘」页一致：取未来 7 天内的笔面试安排，按开始时间升序。
 */
const findUpcomingInterviews = (
  records: WorkbenchRecord[],
  now: Dayjs,
): WorkbenchRecord[] => {
  const weekEnd: Dayjs = now.add(7, 'day').endOf('day');
  return records
    .filter((record: WorkbenchRecord): boolean => {
      const date: Dayjs | null = parseRecordDate(record, '开始时间');
      return Boolean(date && date.isAfter(now) && date.isBefore(weekEnd));
    })
    .sort(
      (left: WorkbenchRecord, right: WorkbenchRecord): number =>
        (parseRecordDate(left, '开始时间')?.valueOf() ?? 0)
        - (parseRecordDate(right, '开始时间')?.valueOf() ?? 0),
    );
};

/**
 * 与「面试与复盘」页的「下一场面试准备」就绪检查保持一致：
 * 岗位 JD 优先读投递进度记录，准备文档读笔面试记录。
 */
const getInterviewReadiness = (
  nextInterview: WorkbenchRecord,
  nextProgress: WorkbenchRecord | undefined,
): HomeReadinessCheck[] => [
  {
    key: 'jd',
    label: '岗位 JD',
    ready: hasRecordValue(nextProgress ?? nextInterview, '岗位 JD'),
  },
  {
    key: 'prepDoc',
    label: '准备文档',
    ready: hasRecordValue(nextInterview, '面试准备文档'),
  },
];

/**
 * 把合并后的日程（Base 为主、个人日历去重补充）按天装入近 N 天视图。
 */
const buildHomeTimelineDays = (
  schedule: HomeScheduleItem[],
  now: Dayjs,
  dayCount = 7,
): HomeTimelineDay[] => {
  const start: Dayjs = now.startOf('day');
  const end: Dayjs = start.add(dayCount, 'day');
  const days: HomeTimelineDay[] = Array.from(
    { length: dayCount },
    (_value: unknown, index: number): HomeTimelineDay => {
      const day: Dayjs = start.add(index, 'day');
      return {
        key: day.format('YYYY-MM-DD'),
        dateLabel: day.format('MM/DD'),
        weekdayLabel: WEEKDAY_LABELS[day.day()],
        isToday: index === 0,
        items: [],
      };
    },
  );
  for (const item of schedule) {
    const date: Dayjs = dayjs(item.startAt);
    if (!date.isValid() || date.isBefore(start) || !date.isBefore(end)) {
      continue;
    }
    const index: number = date.startOf('day').diff(start, 'day');
    days[index]?.items.push(item);
  }
  return days;
};

const summarizeHomeTimeline = (
  days: HomeTimelineDay[],
): HomeScheduleSummary => {
  const items: HomeScheduleItem[] = days.flatMap(
    (day: HomeTimelineDay): HomeScheduleItem[] => day.items,
  );
  const exams: number = items.filter(
    (item: HomeScheduleItem): boolean => item.stage.includes('笔试'),
  ).length;
  const calendarOnly: number = items.filter(
    (item: HomeScheduleItem): boolean => item.source === 'calendar',
  ).length;
  return {
    total: items.length,
    interviews: items.length - exams - calendarOnly,
    exams,
    calendarOnly,
  };
};

export {
  WEEKDAY_LABELS,
  buildHomeTimelineDays,
  findUpcomingInterviews,
  getInterviewReadiness,
  parseRecordDate,
  readRecordText,
  summarizeHomeTimeline,
};
export type {
  HomeReadinessCheck,
  HomeScheduleSummary,
  HomeTimelineDay,
};
