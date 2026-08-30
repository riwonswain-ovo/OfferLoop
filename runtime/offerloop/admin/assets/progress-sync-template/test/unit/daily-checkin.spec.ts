import {
  actionsFor,
  DAILY_CHECKIN_TIME,
  deriveAsyncWindow,
  emptyCheckinCard,
  groupPendingRecords,
  MAX_RECORDS_PER_CARD,
  paginateCheckinGroups,
  parseCheckinAction,
  populatedCheckinCard,
  rescheduleForm,
  rescheduleCard,
  validateCurrentCheckinAction,
  validateOwner,
} from '../../server/modules/job-progress-sync/daily-checkin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('daily check-in v2 rules', () => {
  const now: Date = new Date('2026-08-24T22:10:00+08:00');

  it('runs at 22:10 and sends an empty-state Card 2.0', () => {
    expect(DAILY_CHECKIN_TIME).toBe('22:10');
    expect(emptyCheckinCard()).toMatchObject({ schema: '2.0' });
  });

  it('matches the shared Python/JS/TS contract fixture', () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), '../../../../../skills/recruiting-reminder/contracts/daily-checkin-cases.json'), 'utf8')) as {
      now: string; records: Array<{record_id: string; fields: Record<string, unknown>}>;
      expected_groups: Record<string, string[]>;
    };
    const groups = groupPendingRecords(fixture.records, new Date(fixture.now));
    expect(Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.map((item) => item.record_id)]))).toEqual(fixture.expected_groups);
  });

  it('uses mutually exclusive pending groups and ignores cancelled records', () => {
    const groups = groupPendingRecords([
      { record_id: 'today', fields: { 完成状态: '待完成', 事件状态: '有效', 开始时间: '2026-08-24T20:00:00+08:00', 结束时间: '2026-08-24T23:00:00+08:00' } },
      { record_id: 'plan', fields: { 完成状态: '待完成', 事件状态: '有效', 结束时间: '2026-08-24T20:00:00+08:00', 截止时间: '2026-08-25T20:00:00+08:00' } },
      { record_id: 'deadline', fields: { 完成状态: '待完成', 事件状态: '有效', 结束时间: '2026-08-23T20:00:00+08:00', 截止时间: '2026-08-24T20:00:00+08:00' } },
      { record_id: 'cancelled', fields: { 完成状态: '待完成', 事件状态: '已取消', 开始时间: '2026-08-24T20:00:00+08:00' } },
      { record_id: 'draft', fields: { 完成状态: '待完成', 事件状态: '草稿', 开始时间: '2026-08-24T20:00:00+08:00' } },
      { record_id: 'missing-status', fields: { 完成状态: '待完成', 开始时间: '2026-08-24T20:00:00+08:00' } },
      { record_id: 'unplanned', fields: { 完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2026-08-25T20:00:00+08:00' } },
    ], now);
    expect(groups.today.map((item) => item.record_id)).toEqual(['today']);
    expect(groups.plan_overdue.map((item) => item.record_id)).toEqual(['plan']);
    expect(groups.deadline_overdue.map((item) => item.record_id)).toEqual(['deadline']);
    expect(groups.unplanned.map((item) => item.record_id)).toEqual(['unplanned']);
    expect(Object.values(groups).flat().map((item) => item.record_id)).not.toContain('draft');
    expect(Object.values(groups).flat().map((item) => item.record_id)).not.toContain('missing-status');
  });

  it('revalidates stale or forged callback actions against current state', () => {
    const unplanned = { record_id: 'recExam', fields: { 完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2026-08-25T20:00:00+08:00' } };
    expect(validateCurrentCheckinAction(unplanned, 'adjust', now)).toBe('unplanned');
    expect(() => validateCurrentCheckinAction(unplanned, 'missed', now)).toThrow('eligible');
    expect(() => validateCurrentCheckinAction({ ...unplanned, fields: { ...unplanned.fields, 事件状态: '草稿' } }, 'adjust', now)).toThrow('eligible');
  });

  it('reveals adjustment only after not-completed for async events', () => {
    const asyncExam = { record_id: 'recExam', fields: { 环节: '笔试', 进行方式: '异步' } };
    expect(actionsFor(asyncExam, 'plan_overdue')).toEqual(['completed', 'not_completed']);
    expect(rescheduleForm('recExam')).toMatchObject({ tag: 'form' });
    expect(rescheduleCard('recExam')).toMatchObject({ schema: '2.0', body: { elements: expect.arrayContaining([expect.objectContaining({ tag: 'form' })]) } });
    const fixed = { record_id: 'recInterview', fields: { 环节: '一面', 进行方式: '同步' } };
    expect(actionsFor(fixed, 'plan_overdue')).toEqual(['completed', 'missed']);
    expect(actionsFor(fixed, 'today')).toEqual(['completed', 'missed']);
  });

  it('derives a 90-minute async window before the true deadline', () => {
    const record = { record_id: 'recExam', fields: { 环节: '测评', 进行方式: '异步', 已建日程ID: 'evt1', 截止时间: '2026-08-25T18:00:00+08:00' } };
    expect(deriveAsyncWindow(record, '2026-08-25T15:30:00+08:00', now)).toEqual({
      start: '2026-08-25T07:30:00.000Z',
      end: '2026-08-25T09:00:00.000Z',
    });
    expect(() => deriveAsyncWindow(record, '2026-08-25T17:00:00+08:00', now)).toThrow('deadline');
    expect(() => deriveAsyncWindow(
      { ...record, fields: { ...record.fields, 截止时间: '' } },
      '2026-08-25T15:30:00+08:00', now,
    )).toThrow('deadline');
  });

  it('preserves an explicit mail duration when adjusting an async event', () => {
    const record = {
      record_id: 'recAssessment',
      fields: {
        环节: '测评',
        进行方式: '异步',
        已建日程ID: 'evt45',
        开始时间: '2026-08-24T10:00:00+08:00',
        结束时间: '2026-08-24T10:45:00+08:00',
        截止时间: '2026-08-25T18:00:00+08:00',
      },
    };
    expect(deriveAsyncWindow(record, '2026-08-25T15:30:00+08:00', now)).toEqual({
      start: '2026-08-25T07:30:00.000Z',
      end: '2026-08-25T08:15:00.000Z',
    });
    expect(deriveAsyncWindow({
      ...record,
      fields: { ...record.fields, 开始时间: '', 结束时间: '', '预计时长（分钟）': 45 },
    }, '2026-08-25T15:30:00+08:00', now)).toEqual({
      start: '2026-08-25T07:30:00.000Z',
      end: '2026-08-25T08:15:00.000Z',
    });
  });

  it('allows only the configured owner', () => {
    expect(() => validateOwner('ou_owner', 'ou_owner')).not.toThrow();
    expect(() => validateOwner('ou_viewer', 'ou_owner')).toThrow('owner');
  });

  it('renders and parses the full record id without title fallback', () => {
    const groups = groupPendingRecords([{ record_id: 'recFullIdentifier123', fields: { 完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2026-08-25T20:00:00+08:00' } }], now);
    expect(JSON.stringify(populatedCheckinCard(groups))).toContain('recFullIdentifier123');
    expect(parseCheckinAction({ operator: { open_id: 'ou_owner' }, action: { value: { action: 'adjust', record_id: 'recFullIdentifier123' }, form_value: {} } }, 'ou_owner').recordId).toBe('recFullIdentifier123');
    const form = rescheduleForm('recFullIdentifier123');
    expect(JSON.stringify(form)).toContain('adjust:recFullIdentifier123');
    expect(parseCheckinAction({ operator_id: 'ou_owner', action_name: 'adjust:recFullIdentifier123', form_value: '{"planned_date":"2026-08-25","planned_start":"15:30"}' }, 'ou_owner')).toMatchObject({ action: 'adjust', recordId: 'recFullIdentifier123' });
  });

  it('paginates large histories and bounds untrusted card text', () => {
    const records = Array.from({ length: MAX_RECORDS_PER_CARD + 1 }, (_, index) => ({
      record_id: `rec${index}`,
      fields: { 完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2026-08-25T20:00:00+08:00', 安排名称: `**伪标题**\n${'x'.repeat(300)}` },
    }));
    const pages = paginateCheckinGroups(groupPendingRecords(records, now));
    expect(pages).toHaveLength(2);
    expect(Object.values(pages[0]).flat()).toHaveLength(MAX_RECORDS_PER_CARD);
    const rendered = JSON.stringify(populatedCheckinCard(pages[0]));
    expect(rendered).not.toContain('**伪标题**');
    expect(rendered).not.toContain('\n');
  });
});
