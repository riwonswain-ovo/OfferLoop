export const DAILY_CHECKIN_TIME = '22:10';
export const DAILY_CHECKIN_TIMEZONE = 'Asia/Shanghai';

export interface ReminderRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

export type CheckinGroup = 'today' | 'plan_overdue' | 'deadline_overdue' | 'unplanned';
export type CheckinAction = 'completed' | 'not_completed' | 'missed' | 'adjust' | 'adjust_retry' | 'adjust_confirmed';
const CHECKIN_GROUP_ORDER: CheckinGroup[] = ['today', 'plan_overdue', 'deadline_overdue', 'unplanned'];
export const MAX_RECORDS_PER_CARD = 25;

const FIXED_STAGES: Set<string> = new Set([
  '群面', '一面', '二面', '三面', '面试', 'HR面',
]);
const ASYNC_STAGES: Set<string> = new Set(['测评', '笔试']);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function cardText(value: unknown, limit: number = 160): string {
  return text(value)
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .slice(0, limit)
    .replace(/&/gu, '&#38;')
    .replace(/</gu, '&#60;')
    .replace(/>/gu, '&#62;')
    .replace(/\*/gu, '&#42;')
    .replace(/_/gu, '&#95;')
    .replace(/\[/gu, '&#91;')
    .replace(/\]/gu, '&#93;');
}

function millis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed: number = Date.parse(text(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function shanghaiDate(value: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: DAILY_CHECKIN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function groupPendingRecords(
  records: ReminderRecord[],
  now: Date,
): Record<CheckinGroup, ReminderRecord[]> {
  const groups: Record<CheckinGroup, ReminderRecord[]> = {
    today: [],
    plan_overdue: [],
    deadline_overdue: [],
    unplanned: [],
  };
  const today: string = shanghaiDate(now);
  for (const record of records) {
    const fields: Record<string, unknown> = record.fields;
    if (
      text(fields['完成状态']) !== '待完成'
      || text(fields['事件状态']) !== '有效'
    ) continue;
    const start: number | null = millis(fields['开始时间']);
    const end: number | null = millis(fields['结束时间']);
    const deadline: number | null = millis(fields['截止时间']);
    if (deadline !== null && deadline < now.getTime()) {
      groups.deadline_overdue.push(record);
    } else if (start === null && end === null && ASYNC_STAGES.has(text(fields['环节'])) && text(fields['进行方式']) === '异步') {
      groups.unplanned.push(record);
    } else if ((end !== null && end < now.getTime()) || (end === null && start !== null && start < now.getTime())) {
      groups.plan_overdue.push(record);
    } else if (start !== null && shanghaiDate(new Date(start)) === today) {
      groups.today.push(record);
    }
  }
  return groups;
}

export function paginateCheckinGroups(
  groups: Record<CheckinGroup, ReminderRecord[]>,
  pageSize: number = MAX_RECORDS_PER_CARD,
): Array<Record<CheckinGroup, ReminderRecord[]>> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('page size must be positive');
  const flattened = CHECKIN_GROUP_ORDER.flatMap((group: CheckinGroup) => (
    groups[group].map((record: ReminderRecord) => ({ group, record }))
  ));
  const pages: Array<Record<CheckinGroup, ReminderRecord[]>> = [];
  for (let offset = 0; offset < flattened.length; offset += pageSize) {
    const page: Record<CheckinGroup, ReminderRecord[]> = {
      today: [], plan_overdue: [], deadline_overdue: [], unplanned: [],
    };
    for (const item of flattened.slice(offset, offset + pageSize)) page[item.group].push(item.record);
    pages.push(page);
  }
  return pages;
}

export function actionsFor(
  record: ReminderRecord,
  group: CheckinGroup,
): CheckinAction[] {
  if (group === 'unplanned') return ['adjust'];
  if (group === 'deadline_overdue') return ['completed', 'missed'];
  const stage: string = text(record.fields['环节']);
  const mode: string = text(record.fields['进行方式']);
  if (FIXED_STAGES.has(stage) || mode === '同步') {
    return ['completed', 'missed'];
  }
  return ['completed', 'not_completed'];
}

export function validateCurrentCheckinAction(
  record: ReminderRecord,
  action: CheckinAction,
  now: Date = new Date(),
): CheckinGroup {
  const groups = groupPendingRecords([record], now);
  const group = CHECKIN_GROUP_ORDER.find((candidate: CheckinGroup): boolean => groups[candidate].length === 1);
  if (!group) throw new Error('record is not currently eligible for daily check-in');
  if (action === 'adjust' || action === 'adjust_retry' || action === 'adjust_confirmed') {
    if (!isAsyncAdjustable(record) || group === 'deadline_overdue') {
      throw new Error('record is not currently eligible for rescheduling');
    }
    return group;
  }
  if (!actionsFor(record, group).includes(action)) {
    throw new Error('action is not currently eligible for this record');
  }
  return group;
}

export function validateOwner(operatorOpenId: string, ownerOpenId: string): void {
  if (!ownerOpenId || operatorOpenId !== ownerOpenId) {
    throw new Error('only the configured owner may operate the daily card');
  }
}

export function isAsyncAdjustable(record: ReminderRecord): boolean {
  return ASYNC_STAGES.has(text(record.fields['环节']))
    && text(record.fields['进行方式']) === '异步';
}

export function deriveAsyncWindow(
  record: ReminderRecord,
  startIso: string,
  now: Date = new Date(),
): { start: string; end: string } {
  if (!isAsyncAdjustable(record)) {
    throw new Error('fixed-time events cannot be rescheduled');
  }
  const start: number = Date.parse(startIso);
  if (Number.isNaN(start)) throw new Error('invalid planned start');
  if (start <= now.getTime()) throw new Error('planned start must be in the future');
  const previousStart: number | null = millis(record.fields['开始时间']);
  const previousEnd: number | null = millis(record.fields['结束时间']);
  const duration: number = previousStart !== null
    && previousEnd !== null
    && previousEnd > previousStart
    ? previousEnd - previousStart
    : storedDurationMillis(record.fields);
  const end: number = start + duration;
  const deadline: number | null = millis(record.fields['截止时间']);
  if (deadline === null) {
    throw new Error('async event requires a recruiter deadline');
  }
  if (end > deadline) {
    throw new Error('planned end must not exceed the recruiter deadline');
  }
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

function storedDurationMillis(fields: Record<string, unknown>): number {
  const minutes: number = Number(fields['预计时长（分钟）'] ?? 90);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
    throw new Error('stored duration must be a positive number');
  }
  return minutes * 60 * 1000;
}

export function emptyCheckinCard(): Record<string, unknown> {
  return {
    schema: '2.0',
    config: { width_mode: 'default', update_multi: true },
    header: {
      title: { tag: 'plain_text', content: 'OfferLoop 今日确认' },
      template: 'green',
      icon: { tag: 'standard_icon', token: 'todo_colorful' },
    },
    body: {
      padding: '12px 12px 20px 12px',
      elements: [{
        tag: 'markdown',
        content: '**今日没有待完成事件**\n辛苦啦，愿你今晚安心收尾 🌙',
      }],
    },
  };
}

export function populatedCheckinCard(
  groups: Record<CheckinGroup, ReminderRecord[]>,
): Record<string, unknown> {
  const labels: Record<CheckinGroup, string> = {
    today: '今天计划完成', plan_overdue: '计划时间已过',
    deadline_overdue: '招聘方截止已过', unplanned: '尚未安排计划时间',
  };
  const elements: Record<string, unknown>[] = [];
  for (const group of CHECKIN_GROUP_ORDER) {
    if (groups[group].length === 0) continue;
    elements.push({ tag: 'markdown', content: `**${labels[group]}（${groups[group].length}）**` });
    for (const record of groups[group]) {
      const name: string = cardText(record.fields['安排名称'])
        || `${cardText(record.fields['公司'], 100)}－${cardText(record.fields['环节'], 24)}`;
      const actions: CheckinAction[] = actionsFor(record, group);
      elements.push({
        tag: 'column_set',
        flex_mode: 'none',
        horizontal_spacing: 'medium',
        columns: [
          { tag: 'column', width: 'weighted', weight: 2, elements: [{ tag: 'markdown', content: name }] },
          {
            tag: 'column', width: 'weighted', weight: 1,
            vertical_spacing: 'small',
            elements: actions.map((action: CheckinAction, index: number): Record<string, unknown> => ({
              tag: 'button',
              text: { tag: 'plain_text', content: ({ completed: '已完成', not_completed: '暂未完成', missed: '已错过', adjust: '调整日程' })[action] },
              type: index === 0 ? 'primary_filled' : 'default',
              size: 'small',
              behaviors: [{ type: 'callback', value: { action, record_id: record.record_id, group } }],
            })),
          },
        ],
      });
    }
  }
  return {
    schema: '2.0', config: { width_mode: 'default', update_multi: true },
    header: { title: { tag: 'plain_text', content: 'OfferLoop 今日确认' }, template: 'green', icon: { tag: 'standard_icon', token: 'todo_colorful' } },
    body: { padding: '12px 12px 20px 12px', vertical_spacing: 'large', elements },
  };
}

export function parseCheckinAction(
  payload: Record<string, unknown>, ownerOpenId: string,
): { action: CheckinAction; recordId: string; formValue: Record<string, unknown>; plannedStart: string; retryFailedStep: string } {
  const root: Record<string, unknown> = (payload.event ?? payload) as Record<string, unknown>;
  const operator: Record<string, unknown> = (root.operator ?? {}) as Record<string, unknown>;
  validateOwner(text(operator.open_id || (operator.operator_id as Record<string, unknown> | undefined)?.open_id || root.operator_id), ownerOpenId);
  const actionBlock: Record<string, unknown> = (root.action ?? {}) as Record<string, unknown>;
  let rawValue: unknown = actionBlock.value ?? root.action_value ?? {};
  if (typeof rawValue === 'string') {
    try { rawValue = JSON.parse(rawValue) as unknown; } catch { rawValue = {}; }
  }
  const value: Record<string, unknown> = (rawValue ?? {}) as Record<string, unknown>;
  const actionName: string = text(actionBlock.name || root.action_name);
  const recordId: string = text(value.record_id || (actionName.startsWith('adjust:') ? actionName.slice(7) : ''));
  if (!/^rec[A-Za-z0-9_-]+$/u.test(recordId)) throw new Error('exact record ID is required');
  const action: string = text(value.action || (actionName.startsWith('adjust:') ? 'adjust' : ''));
  if (!['completed', 'not_completed', 'missed', 'adjust', 'adjust_retry', 'adjust_confirmed'].includes(action)) throw new Error('unsupported card action');
  let rawForm: unknown = actionBlock.form_value ?? root.form_value ?? {};
  if (typeof rawForm === 'string') rawForm = JSON.parse(rawForm || '{}') as unknown;
  return {
    action: action as CheckinAction,
    recordId,
    formValue: rawForm as Record<string, unknown>,
    plannedStart: text(value.planned_start),
    retryFailedStep: text(value.retry_failed_step),
  };
}

export function conflictConfirmationCard(
  recordId: string,
  plannedStart: string,
): Record<string, unknown> {
  return {
    schema: '2.0',
    header: { title: { tag: 'plain_text', content: '该时间与现有日程冲突' }, template: 'orange' },
    body: { elements: [
      { tag: 'markdown', content: '所选时间已有个人日程。是否仍按这个时间调整？' },
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '仍然调整' },
        type: 'primary_filled',
        behaviors: [{ type: 'callback', value: { action: 'adjust_confirmed', record_id: recordId, planned_start: plannedStart } }],
      },
    ] },
  };
}

export function adjustmentRetryCard(
  recordId: string,
  plannedStart: string,
  conflictAlreadyChecked: boolean = true,
): Record<string, unknown> {
  return {
    schema: '2.0',
    header: { title: { tag: 'plain_text', content: '日历调整失败' }, template: 'red' },
    body: { elements: [
      { tag: 'markdown', content: '已记录失败步骤，没有自动补偿。需要时请手动点击重试。' },
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '重试日历调整' },
        type: 'primary_filled',
        behaviors: [{ type: 'callback', value: { action: conflictAlreadyChecked ? 'adjust_confirmed' : 'adjust_retry', record_id: recordId, planned_start: plannedStart, retry_failed_step: conflictAlreadyChecked ? 'calendar_upsert' : 'calendar_conflict_check' } }],
      },
    ] },
  };
}

export function operationRetryCard(
  recordId: string,
  action: 'completed' | 'missed',
  failedStep: 'Base 状态写入' | '求职进展联动',
): Record<string, unknown> {
  return {
    schema: '2.0',
    header: { title: { tag: 'plain_text', content: `${failedStep}失败` }, template: 'red', icon: { tag: 'standard_icon', token: 'warning_colorful' } },
    body: { padding: '12px 12px 20px 12px', elements: [
      { tag: 'markdown', content: `**失败步骤：${failedStep}**\n已成功的部分不会重复创建，请手动重试失败部分。` },
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '重试刚才的操作' },
        type: 'primary_filled',
        width: 'fill',
        behaviors: [{ type: 'callback', value: { action, record_id: recordId, retry_failed_step: failedStep } }],
      },
    ] },
  };
}

export function rescheduleForm(recordId: string): Record<string, unknown> {
  return {
    tag: 'form',
    name: 'adjust_schedule',
    elements: [
      { tag: 'date_picker', name: 'planned_date', required: true, placeholder: { tag: 'plain_text', content: '选择日期' } },
      { tag: 'picker_time', name: 'planned_start', required: true, placeholder: { tag: 'plain_text', content: '选择开始时间' } },
      {
        tag: 'button',
        name: `adjust:${recordId}`,
        text: { tag: 'plain_text', content: '确认调整' },
        type: 'primary_filled',
        width: 'fill',
        form_action_type: 'submit',
      },
    ],
  };
}

export function rescheduleCard(recordId: string): Record<string, unknown> {
  return {
    schema: '2.0',
    config: { width_mode: 'default', update_multi: true },
    header: { title: { tag: 'plain_text', content: '调整日程' }, template: 'blue', icon: { tag: 'standard_icon', token: 'calendar_colorful' } },
    body: {
      padding: '12px 12px 20px 12px',
      vertical_spacing: 'large',
      elements: [
        { tag: 'markdown', content: '**重新选择计划开始时间**\n结束时间会按该事件原时长自动计算。' },
        rescheduleForm(recordId),
      ],
    },
  };
}
