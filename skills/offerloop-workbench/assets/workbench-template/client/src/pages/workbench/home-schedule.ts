import type {
  BaseCellValue,
  WorkbenchCalendarEvent,
  WorkbenchRecord,
} from '@shared/api.interface';

export interface HomeScheduleItem {
  key: string;
  title: string;
  startAt: string;
  stage: string;
  source: 'base' | 'calendar';
  url?: string;
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

const toIsoDate = (value: BaseCellValue | undefined): string => {
  const text: string = cellText(value);
  if (!text) {
    return '';
  }
  const numeric: number = Number(text);
  const date = new Date(Number.isFinite(numeric) ? numeric : text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const sortValue = (value: string): number => {
  const timestamp: number = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
};

export const mergeHomeSchedule = (
  baseRecords: WorkbenchRecord[],
  calendarEvents: WorkbenchCalendarEvent[],
): HomeScheduleItem[] => {
  const baseEventIds: Set<string> = new Set(
    baseRecords
      .map((record: WorkbenchRecord): string =>
        cellText(record.fields['已建日程ID']),
      )
      .filter(Boolean),
  );
  const baseItems: HomeScheduleItem[] = baseRecords.map(
    (record: WorkbenchRecord): HomeScheduleItem => {
      const company: string = cellText(record.fields['公司']);
      const position: string = cellText(record.fields['岗位']);
      return {
        key: `base:${record.recordId}`,
        title: [company, position].filter(Boolean).join(' · ') || '招聘安排',
        startAt: toIsoDate(record.fields['开始时间']),
        stage: cellText(record.fields['环节']) || '待确认',
        source: 'base',
      };
    },
  );
  const calendarItems: HomeScheduleItem[] = calendarEvents
    .filter(
      (event: WorkbenchCalendarEvent): boolean =>
        !baseEventIds.has(event.eventId),
    )
    .map(
      (event: WorkbenchCalendarEvent): HomeScheduleItem => ({
        key: `calendar:${event.eventId}`,
        title: event.title || '个人日历安排',
        startAt: event.startAt,
        stage: '个人日历',
        source: 'calendar',
        url: event.url,
      }),
    );

  return [...baseItems, ...calendarItems].sort(
    (left: HomeScheduleItem, right: HomeScheduleItem): number =>
      sortValue(left.startAt) - sortValue(right.startAt),
  );
};
