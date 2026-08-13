import dayjs from 'dayjs';

import type { WorkbenchRecord } from '@shared/api.interface';

import {
  buildHomeTimelineDays,
  findUpcomingInterviews,
  getInterviewReadiness,
  summarizeHomeTimeline,
  type HomeTimelineDay,
} from '../../client/src/pages/workbench/home-overview';
import type { HomeScheduleItem } from '../../client/src/pages/workbench/home-schedule';

const createRecord = (
  recordId: string,
  fields: WorkbenchRecord['fields'],
): WorkbenchRecord => ({ recordId, fields });

const createScheduleItem = (
  key: string,
  startAt: string,
  stage: string,
  source: HomeScheduleItem['source'] = 'base',
): HomeScheduleItem => ({
  key,
  title: '公司 · 岗位',
  startAt,
  stage,
  source,
});

describe('findUpcomingInterviews', () => {
  it('keeps only events within the next 7 days and sorts ascending', () => {
    const now = dayjs('2026-07-30 09:00');
    const records: WorkbenchRecord[] = [
      createRecord('later', { 开始时间: '2026-08-02 14:00' }),
      createRecord('past', { 开始时间: '2026-07-29 14:00' }),
      createRecord('next', { 开始时间: '2026-07-30 10:00' }),
      createRecord('far', { 开始时间: '2026-08-20 10:00' }),
      createRecord('invalid', { 开始时间: '' }),
    ];

    const result: WorkbenchRecord[] = findUpcomingInterviews(records, now);

    expect(result.map((record) => record.recordId)).toEqual(['next', 'later']);
  });
});

describe('getInterviewReadiness', () => {
  it('prefers the linked progress record for 岗位 JD and checks the preparation document', () => {
    const interview = createRecord('event', {
      面试准备文档: '',
    });
    const progress = createRecord('progress', { '岗位 JD': '负责 AI 产品' });

    expect(getInterviewReadiness(interview, progress)).toEqual([
      { key: 'jd', label: '岗位 JD', ready: true },
      { key: 'prepDoc', label: '准备文档', ready: false },
    ]);
  });

  it('falls back to the interview record for 岗位 JD when progress is missing', () => {
    const interview = createRecord('event', { '岗位 JD': '岗位描述' });

    expect(
      getInterviewReadiness(interview, undefined).map((check) => check.ready),
    ).toEqual([true, false]);
  });
});

describe('buildHomeTimelineDays', () => {
  it('builds 7 day buckets starting today and groups items by day', () => {
    const now = dayjs('2026-07-30 09:00');
    const schedule: HomeScheduleItem[] = [
      createScheduleItem('today', '2026-07-30 14:00', '一面'),
      createScheduleItem('plus2', '2026-08-01 10:00', '笔试'),
      createScheduleItem('outside', '2026-08-10 10:00', '二面'),
      createScheduleItem('invalid', 'not-a-date', '三面'),
    ];

    const days: HomeTimelineDay[] = buildHomeTimelineDays(schedule, now);

    expect(days).toHaveLength(7);
    expect(days[0].isToday).toBe(true);
    expect(days[1].isToday).toBe(false);
    expect(days[0].items.map((item) => item.key)).toEqual(['today']);
    expect(days[2].items.map((item) => item.key)).toEqual(['plus2']);
    expect(
      days.flatMap((day: HomeTimelineDay) => day.items),
    ).toHaveLength(2);
  });
});

describe('summarizeHomeTimeline', () => {
  it('counts exams and calendar-only items separately from interviews', () => {
    const now = dayjs('2026-07-30 09:00');
    const days: HomeTimelineDay[] = buildHomeTimelineDays(
      [
        createScheduleItem('i1', '2026-07-30 14:00', '一面'),
        createScheduleItem('e1', '2026-07-31 14:00', '笔试'),
        createScheduleItem('c1', '2026-08-01 14:00', '个人日历', 'calendar'),
      ],
      now,
    );

    expect(summarizeHomeTimeline(days)).toEqual({
      total: 3,
      interviews: 1,
      exams: 1,
      calendarOnly: 1,
    });
  });
});
