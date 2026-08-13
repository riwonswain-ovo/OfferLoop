import type {
  WorkbenchCalendarEvent,
  WorkbenchRecord,
} from '@shared/api.interface';

import {
  mergeHomeSchedule,
  type HomeScheduleItem,
} from '../../client/src/pages/workbench/home-schedule';

describe('mergeHomeSchedule', () => {
  it('keeps Base as the primary source and removes matching calendar events', () => {
    const baseRecords: WorkbenchRecord[] = [{
      recordId: 'base-kargo',
      fields: {
        公司: '卡尔动力',
        岗位: '自动驾驶产品助理',
        环节: '一面',
        开始时间: Date.parse('2026-08-04T06:00:00.000Z'),
        已建日程ID: 'calendar-kargo',
      },
    }];
    const calendarEvents: WorkbenchCalendarEvent[] = [
      {
        eventId: 'calendar-kargo',
        title: '卡尔动力－自动驾驶产品助理－一面',
        startAt: '2026-08-04T06:00:00.000Z',
        endAt: '2026-08-04T07:00:00.000Z',
        isAllDay: false,
      },
      {
        eventId: 'calendar-only',
        title: '另一场面试',
        startAt: '2026-08-03T02:00:00.000Z',
        endAt: '2026-08-03T03:00:00.000Z',
        isAllDay: false,
        url: 'https://example.com/calendar-only',
      },
    ];

    const result: HomeScheduleItem[] = mergeHomeSchedule(
      baseRecords,
      calendarEvents,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      key: 'calendar:calendar-only',
      source: 'calendar',
    });
    expect(result[1]).toMatchObject({
      key: 'base:base-kargo',
      title: '卡尔动力 · 自动驾驶产品助理',
      stage: '一面',
      source: 'base',
    });
    expect(
      result.filter((item: HomeScheduleItem): boolean =>
        item.title.includes('卡尔动力'),
      ),
    ).toHaveLength(1);
  });
});
