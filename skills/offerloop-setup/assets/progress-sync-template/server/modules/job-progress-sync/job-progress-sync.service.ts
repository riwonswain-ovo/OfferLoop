import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isAxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'util';
import { firstValueFrom } from 'rxjs';

import type {
  JobProgressSyncRequest,
  JobProgressSyncResponse,
} from '@shared/api.interface';

const OPEN_API_ROOT = 'https://open.feishu.cn/open-apis';
const TOKEN_URL = `${OPEN_API_ROOT}/auth/v3/tenant_access_token/internal`;
const REQUIRED_ENV_NAMES: string[] = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'SOURCE_BASE_TOKEN',
  'SOURCE_TABLE_ID',
  'PROGRESS_BASE_TOKEN',
  'PROGRESS_TABLE_ID',
  'REMINDER_BASE_TOKEN',
  'REMINDER_TABLE_ID',
  'REMINDER_BASE_URL',
  'REMINDER_TASKLIST_GUID',
  'DAILY_CHECKIN_CHAT_ID',
  'DAILY_CHECKIN_OWNER_OPEN_ID',
  'DAILY_CHECKIN_STATUS',
];

interface FeishuTokenResponse {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuApiResponse<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface FeishuRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

interface RecordDetailData {
  record: FeishuRecord;
}

interface RecordSearchData {
  items?: FeishuRecord[];
  has_more?: boolean;
  page_token?: string;
}

interface RecordCreateData {
  record: FeishuRecord;
}

interface DeploymentConfig {
  appId: string;
  appSecret: string;
  sourceBaseToken: string;
  sourceTableId: string;
  progressBaseToken: string;
  progressTableId: string;
  reminderBaseToken: string;
  reminderTableId: string;
  reminderBaseUrl: string;
  reminderTasklistGuid: string;
  reminderTasklistUrl: string;
  dailyCheckinChatId: string;
  dailyCheckinOwnerOpenId: string;
  dailyCheckinStatus: string;
}

interface FeishuChatMember {
  member_id: string;
  name?: string;
}

interface ChatMemberListData {
  items?: FeishuChatMember[];
  member_total?: number;
  has_more?: boolean;
  page_token?: string;
  trigger_security_conf_limit?: boolean;
}

interface MessageSendData {
  message_id?: string;
}

interface FeishuTaskTime {
  timestamp?: string;
}

interface FeishuTask {
  guid?: string;
  status?: 'todo' | 'done';
  due?: FeishuTaskTime;
  url?: string;
}

interface TaskDetailData {
  task: FeishuTask;
}

interface TaskCreateData {
  task: FeishuTask;
}

interface SubtaskCreateData {
  subtask: FeishuTask;
}

interface ReminderOutcomeResult {
  alreadyUpdated: boolean;
  nextStep: string;
  progressRecordFound: boolean;
  targetCompletionStatus: string;
}

export interface DailyCheckinResult {
  status: 'sent' | 'skipped';
  reason?: string;
  messageId?: string;
  eventCount?: number;
}

export interface TaskReconcileResult {
  scanned: number;
  provisioned: number;
  completed: number;
  missed: number;
  postponed: number;
  skipped: number;
}

function requireDeploymentConfig(env: NodeJS.ProcessEnv): DeploymentConfig {
  for (const name of REQUIRED_ENV_NAMES) {
    if (!String(env[name] ?? '').trim()) {
      throw new Error(`missing required environment variable: ${name}`);
    }
  }
  return {
    appId: String(env.FEISHU_APP_ID),
    appSecret: String(env.FEISHU_APP_SECRET),
    sourceBaseToken: String(env.SOURCE_BASE_TOKEN),
    sourceTableId: String(env.SOURCE_TABLE_ID),
    progressBaseToken: String(env.PROGRESS_BASE_TOKEN),
    progressTableId: String(env.PROGRESS_TABLE_ID),
    reminderBaseToken: String(env.REMINDER_BASE_TOKEN),
    reminderTableId: String(env.REMINDER_TABLE_ID),
    reminderBaseUrl: String(env.REMINDER_BASE_URL),
    reminderTasklistGuid: String(env.REMINDER_TASKLIST_GUID),
    reminderTasklistUrl: String(
      env.REMINDER_TASKLIST_URL
      ?? `https://applink.feishu.cn/client/todo/task_list?guid=${encodeURIComponent(String(env.REMINDER_TASKLIST_GUID))}`,
    ),
    dailyCheckinChatId: String(env.DAILY_CHECKIN_CHAT_ID),
    dailyCheckinOwnerOpenId: String(env.DAILY_CHECKIN_OWNER_OPEN_ID),
    dailyCheckinStatus: String(env.DAILY_CHECKIN_STATUS),
  };
}

const EVENT_STAGE_TO_COMPLETED_NODE: Record<string, string> = {
  '笔试': '笔试完成',
  '群面': '群面完成',
  '一面': '一面完成',
  '二面': '二面完成',
  '三面': '三面完成',
  'HR面': 'HR面完成',
  '面试（轮次待确认）': '面试完成',
};

const EVENT_STAGE_TO_NEXT_STEP: Record<string, string> = {
  '笔试': '笔试',
  '群面': '群面',
  '一面': '一面',
  '二面': '二面',
  '三面': '三面',
  'HR面': 'HR面',
  '面试（轮次待确认）': '面试',
};

const NEXT_STEP_TO_PROGRESS_STATUS: Record<string, string> = {
  '待反馈': '待反馈',
  '笔试': '待笔试',
  '面试': '待面试',
  '群面': '待群面',
  '一面': '待一面',
  '二面': '待二面',
  '三面': '待三面',
  'HR面': '待 HR 面',
  'OC': '待 OC',
};

const LEGACY_STAGE_TO_PROGRESS_STATUS: Record<string, string> = {
  '已投递': '待反馈',
  '笔试': '待笔试',
  '群面': '待群面',
  '一面': '待一面',
  '二面': '待二面',
  '三面': '待三面',
  'HR面': '待 HR 面',
  'Offer': 'Offer',
  '已结束': '状态待确认',
};

const MANUAL_PROGRESS_STATUSES: Set<string> = new Set([
  'Offer', '未通过', '主动放弃', '岗位关闭', '状态待确认',
]);

const COMPLETED_NODE_RANK: Record<string, number> = {
  '投递完成': 1,
  '笔试完成': 2,
  '群面完成': 3,
  '一面完成': 4,
  '二面完成': 5,
  '三面完成': 6,
  'HR面完成': 7,
  '面试完成': 8,
};

function stableClientToken(sourceRecordId: string): string {
  const bytes: Buffer = Buffer.from(
    createHash('sha256')
      .update(`offerloop-progress:${sourceRecordId}`)
      .digest()
      .subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
    + `-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function progressStatusFor(fields: Record<string, unknown>): string {
  const current: string = readText(fields['进展状态']);
  if (current) {
    return current;
  }
  const result: string = readText(fields['流程结果']);
  if (['Offer', '未通过', '主动放弃', '岗位关闭'].includes(result)) {
    return result;
  }
  return LEGACY_STAGE_TO_PROGRESS_STATUS[readText(fields['当前阶段'])]
    ?? NEXT_STEP_TO_PROGRESS_STATUS[readText(fields['下一环节'])]
    ?? '待反馈';
}

function stableTaskClientToken(
  reminderRecordId: string,
  outcome: 'completed' | 'not_attended',
): string {
  const bytes: Buffer = Buffer.from(
    createHash('sha256')
      .update(`offerloop-reminder-task:${reminderRecordId}:${outcome}`)
      .digest()
      .subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
    + `-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown): string => readText(item)).filter(Boolean).join('');
  }
  if (typeof value === 'object' && value !== null) {
    const candidate: Record<string, unknown> = value as Record<string, unknown>;
    return readText(candidate.text ?? candidate.name ?? candidate.value ?? '');
  }
  return '';
}

function readOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item: unknown): string => readText(item))
      .filter((item: string): boolean => Boolean(item));
  }
  const option: string = readText(value);
  return option ? [option] : [];
}

function readUrl(value: unknown): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const candidate: Record<string, unknown> = value as Record<string, unknown>;
    const link: string = readText(candidate.link ?? candidate.url ?? '');
    if (link) {
      return link;
    }
  }
  return readText(value);
}

function formatShanghaiDate(value?: string): string {
  const parsed: Date = value && !Number.isNaN(Date.parse(value))
    ? new Date(value)
    : new Date();
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

function readDateMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const text: string = readText(value);
  if (!text) {
    return null;
  }
  if (/^\d+$/u.test(text)) {
    const numeric: number = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const parsed: number = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function escapeCardMarkdown(value: unknown): string {
  return readText(value)
    .replace(/&/gu, '&#38;')
    .replace(/</gu, '&#60;')
    .replace(/>/gu, '&#62;')
    .replace(/\*/gu, '&#42;')
    .replace(/_/gu, '&#95;')
    .replace(/~/gu, '&#126;')
    .replace(/\[/gu, '&#91;')
    .replace(/\]/gu, '&#93;');
}

function formatShanghaiDateTime(value: number | null): string {
  if (value === null) {
    return '时间待确认';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function stableDailyMessageUuid(date: string): string {
  const bytes: Buffer = Buffer.from(
    createHash('sha256')
      .update(`offerloop-daily-checkin:${date}`)
      .digest()
      .subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
    + `-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildEventBlock(
  record: FeishuRecord,
  label: string,
  color: 'red' | 'orange' | 'yellow',
  reminderBaseUrl: string,
): Record<string, unknown> {
  const fields: Record<string, unknown> = record.fields;
  const title: string = [fields['公司'], fields['岗位'], fields['环节']]
    .map((value: unknown): string => escapeCardMarkdown(value))
    .filter(Boolean)
    .join('｜') || '待处理安排';
  const startAt: number | null = readDateMillis(fields['开始时间'] ?? fields['截止时间']);
  const taskUrl: string = readUrl(fields['飞书任务链接']) || reminderBaseUrl;
  return {
    tag: 'column_set',
    flex_mode: 'none',
    margin: '0px 0px 12px 0px',
    columns: [{
      tag: 'column',
      width: 'weighted',
      weight: 1,
      background_style: `${color}-50`,
      padding: '12px',
      vertical_spacing: '4px',
      elements: [
        {
          tag: 'markdown',
          content: `**<font color='${color}'>${label}</font> · ${title}**`,
        },
        {
          tag: 'markdown',
          content: `<font color='grey'>${formatShanghaiDateTime(startAt)}</font>`,
          text_size: 'notation',
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '打开飞书任务' },
          type: 'primary_filled',
          width: 'fill',
          behaviors: [{ type: 'open_url', default_url: taskUrl }],
        },
        {
          tag: 'markdown',
          content: "<font color='grey'>勾选主任务=已完成；勾选“未参加”子任务=未参加；改截止时间=延期。状态会自动同步。</font>",
          text_size: 'notation',
        },
      ],
    }],
  };
}

function buildDailyCheckinCard(
  date: string,
  records: FeishuRecord[],
  reminderBaseUrl: string,
  reminderTasklistUrl: string,
): Record<string, unknown> {
  const dayStart: number = Date.parse(`${date}T00:00:00+08:00`);
  const dayEnd: number = dayStart + 24 * 60 * 60 * 1000;
  const upcomingEnd: number = dayStart + 8 * 24 * 60 * 60 * 1000;
  const groups: Array<{
    label: string;
    color: 'red' | 'orange' | 'yellow';
    records: FeishuRecord[];
  }> = [
    {
      label: '逾期',
      color: 'red',
      records: records.filter((record: FeishuRecord): boolean => {
        const time: number | null = readDateMillis(
          record.fields['开始时间'] ?? record.fields['截止时间'],
        );
        return time !== null && time < dayStart;
      }),
    },
    {
      label: '今天',
      color: 'orange',
      records: records.filter((record: FeishuRecord): boolean => {
        const time: number | null = readDateMillis(
          record.fields['开始时间'] ?? record.fields['截止时间'],
        );
        return time !== null && time >= dayStart && time < dayEnd;
      }),
    },
    {
      label: '近期',
      color: 'yellow',
      records: records.filter((record: FeishuRecord): boolean => {
        const time: number | null = readDateMillis(
          record.fields['开始时间'] ?? record.fields['截止时间'],
        );
        return time !== null && time >= dayEnd && time < upcomingEnd;
      }),
    },
  ];
  const selected: Array<{ record: FeishuRecord; label: string; color: 'red' | 'orange' | 'yellow' }> = [];
  for (const group of groups) {
    const sorted: FeishuRecord[] = [...group.records].sort(
      (left: FeishuRecord, right: FeishuRecord): number =>
        (readDateMillis(left.fields['开始时间'] ?? left.fields['截止时间']) ?? 0)
        - (readDateMillis(right.fields['开始时间'] ?? right.fields['截止时间']) ?? 0),
    );
    for (const record of sorted) {
      if (selected.length >= 3) break;
      selected.push({ record, label: group.label, color: group.color });
    }
  }

  const elements: Record<string, unknown>[] = selected.map(
    (item): Record<string, unknown> =>
      buildEventBlock(item.record, item.label, item.color, reminderBaseUrl),
  );
  if (elements.length === 0) {
    elements.push({
      tag: 'column_set',
      flex_mode: 'none',
      margin: '0px 0px 12px 0px',
      columns: [{
        tag: 'column',
        width: 'weighted',
        weight: 1,
        background_style: 'yellow-50',
        padding: '12px',
        elements: [{
          tag: 'markdown',
          content: '**今天没有待完成的笔试或面试安排。**',
        }],
      }],
    });
  }
  elements.push({
    tag: 'column_set',
    flex_mode: 'none',
    columns: [{
      tag: 'column',
      width: 'weighted',
      weight: 1,
      background_style: 'grey-50',
      padding: '12px',
      vertical_spacing: '8px',
      elements: [
        {
          tag: 'markdown',
          content: '**今天有新的求职进展吗？**\n笔面试结果直接在飞书任务中更新；其他进展直接回复本群即可。',
        },
        {
          tag: 'column_set',
          flex_mode: 'bisect',
          horizontal_spacing: '8px',
          columns: [
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{
                tag: 'button',
                text: { tag: 'plain_text', content: '查看飞书任务' },
                type: 'primary_filled',
                width: 'fill',
                behaviors: [{ type: 'open_url', default_url: reminderTasklistUrl }],
              }],
            },
            {
              tag: 'column',
              width: 'weighted',
              weight: 1,
              elements: [{
                tag: 'button',
                text: { tag: 'plain_text', content: '查看笔面试中心' },
                type: 'default',
                width: 'fill',
                behaviors: [{ type: 'open_url', default_url: reminderBaseUrl }],
              }],
            },
          ],
        },
      ],
    }],
  });
  return {
    schema: '2.0',
    config: {
      update_multi: true,
      width_mode: 'default',
      summary: { content: `OfferLoop ${date} 求职进展确认` },
    },
    header: {
      title: { tag: 'plain_text', content: 'OfferLoop 求职进展确认' },
      subtitle: { tag: 'plain_text', content: `${date} · 每日 21:30` },
      template: 'orange',
      icon: { tag: 'standard_icon', token: 'todo_colorful' },
      text_tag_list: [{
        tag: 'text_tag',
        text: { tag: 'plain_text', content: '待回复' },
        color: 'yellow',
      }],
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 20px 12px',
      vertical_spacing: '0px',
      elements,
    },
  };
}

function toWritableFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...fields };
  const submittedDate: unknown = result['投递日期'];
  if (typeof submittedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(submittedDate)) {
    result['投递日期'] = Date.parse(`${submittedDate}T00:00:00+08:00`);
  }
  return result;
}

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const upstreamData: unknown = error.response?.data;
    const upstreamCode: unknown = upstreamData && typeof upstreamData === 'object'
      ? Reflect.get(upstreamData, 'code')
      : undefined;
    const upstreamMessage: unknown = upstreamData && typeof upstreamData === 'object'
      ? Reflect.get(upstreamData, 'msg')
      : undefined;
    return [
      error.code,
      error.message,
      error.response?.status ? `http=${error.response.status}` : '',
      upstreamCode !== undefined ? `code=${String(upstreamCode)}` : '',
      upstreamMessage ? `msg=${String(upstreamMessage)}` : '',
    ].filter(Boolean).join(' ');
  }
  return error instanceof Error ? error.message : String(error);
}


function chooseLaterCompletedNode(current: string, candidate: string): string {
  const currentRank: number = COMPLETED_NODE_RANK[current] ?? 0;
  const candidateRank: number = COMPLETED_NODE_RANK[candidate] ?? 0;
  return currentRank > candidateRank ? current : candidate;
}

@Injectable()
export class JobProgressSyncService {
  private readonly logger: Logger = new Logger(JobProgressSyncService.name);
  private readonly config: DeploymentConfig;
  private cachedToken: string = '';
  private tokenExpiresAt: number = 0;

  constructor(@Inject(HttpService) private readonly httpService: HttpService) {
    this.config = requireDeploymentConfig(process.env);
  }

  async sync(request: JobProgressSyncRequest): Promise<JobProgressSyncResponse> {
    const sourceRecord: FeishuRecord = await this.getSourceRecord(request.sourceRecordId);
    const statuses: string[] = readOptions(sourceRecord.fields['投递进度']);
    if (!statuses.includes('已投递')) {
      throw new BadRequestException('source record is not submitted');
    }

    const company: string = readText(sourceRecord.fields['公司']);
    if (!company) {
      throw new BadRequestException('source record company is empty');
    }

    const existingRecords: FeishuRecord[] = await this.findProgressRecords(
      request.sourceRecordId,
    );
    const announcementUrl: string = readUrl(sourceRecord.fields['公告链接']);
    const applicationUrl: string = readUrl(sourceRecord.fields['投递链接']);
    const submittedDate: string = formatShanghaiDate(request.transitionedAt);

    if (existingRecords.length === 0) {
      const fields: Record<string, unknown> = {
        '进展状态': '待反馈',
        '最近完成节点': '投递完成',
        '当前阶段': '已投递',
        '下一环节': '待反馈',
        '流程结果': '进行中',
        '公司': company,
        '投递岗位': '',
        '投递日期': submittedDate,
        '岗位 JD': '',
        '公告链接': announcementUrl,
        '投递链接': applicationUrl,
        '企业清单 record_id': request.sourceRecordId,
        '投递记录 ID': `enterprise:${request.sourceRecordId}:default`,
      };
      const recordId: string = await this.createProgressRecord(fields);
      return { ok: true, action: 'created', recordId };
    }

    let updated: boolean = false;
    for (const existing of existingRecords) {
      const existingComparable: Record<string, unknown> = {
        '进展状态': progressStatusFor(existing.fields),
        '当前阶段': readText(existing.fields['当前阶段']) || '已投递',
        '公司': readText(existing.fields['公司']),
        '投递岗位': readText(existing.fields['投递岗位']),
        '投递日期': existing.fields['投递日期'] || submittedDate,
        '岗位 JD': readText(existing.fields['岗位 JD']),
        '公告链接': readUrl(existing.fields['公告链接']),
        '投递链接': readUrl(existing.fields['投递链接']),
        '企业清单 record_id': readText(existing.fields['企业清单 record_id']),
        '投递记录 ID': readText(existing.fields['投递记录 ID']),
      };
      const fields: Record<string, unknown> = {
        ...existingComparable,
        '公司': company,
        '公告链接': announcementUrl,
        '投递链接': applicationUrl,
        '企业清单 record_id': request.sourceRecordId,
        '投递记录 ID': existingComparable['投递记录 ID']
          || `progress:${existing.record_id}`,
      };
      if (!isDeepStrictEqual(fields, existingComparable)) {
        await this.updateProgressRecord(existing.record_id, fields);
        updated = true;
      }
    }
    return {
      ok: true,
      action: updated ? 'updated' : 'unchanged',
      recordId: existingRecords[0].record_id,
    };
  }

  async reconcileTaskStates(): Promise<TaskReconcileResult> {
    const result: TaskReconcileResult = {
      scanned: 0,
      provisioned: 0,
      completed: 0,
      missed: 0,
      postponed: 0,
      skipped: 0,
    };
    const records: FeishuRecord[] = await this.listPendingReminderRecords();
    for (const record of records) {
      result.scanned += 1;
      try {
        const taskMapping = await this.ensureReminderTaskMapping(record);
        if (taskMapping.provisioned) {
          result.provisioned += 1;
        }
        const mappedRecord: FeishuRecord = taskMapping.record;
        const taskGuid: string = readText(mappedRecord.fields['飞书任务GUID']);
        const missedTaskGuid: string = readText(mappedRecord.fields['未参加任务GUID']);
        const task: FeishuTask = await this.getTask(taskGuid);
        const missedTask: FeishuTask | null = missedTaskGuid
          ? await this.getTask(missedTaskGuid)
          : null;
        if (missedTask?.status === 'done') {
          await this.applyReminderOutcome(mappedRecord, 'not_attended');
          result.missed += 1;
          continue;
        }
        if (task.status === 'done') {
          await this.applyReminderOutcome(mappedRecord, 'completed');
          result.completed += 1;
          continue;
        }
        const dueAt: number | null = readDateMillis(task.due?.timestamp);
        const currentStartAt: number | null = readDateMillis(mappedRecord.fields['开始时间']);
        const currentDeadlineAt: number | null = readDateMillis(mappedRecord.fields['截止时间']);
        const currentTaskTime: number | null = currentStartAt ?? currentDeadlineAt;
        if (dueAt !== null && dueAt !== currentTaskTime) {
          const updatedFields: Record<string, unknown> = {};
          if (currentStartAt !== null) {
            updatedFields['开始时间'] = dueAt;
            const currentEndAt: number | null = readDateMillis(mappedRecord.fields['结束时间']);
            if (currentEndAt !== null && currentEndAt >= currentStartAt) {
              updatedFields['结束时间'] = dueAt + (currentEndAt - currentStartAt);
            }
          } else {
            updatedFields['截止时间'] = dueAt;
          }
          await this.updateReminderRecord(mappedRecord.record_id, updatedFields);
          result.postponed += 1;
        }
      } catch (error: unknown) {
        result.skipped += 1;
        this.logger.warn(
          `skipped task reconciliation for ${record.record_id}: ${errorMessage(error)}`,
        );
      }
    }
    return result;
  }

  async sendDailyCheckin(): Promise<DailyCheckinResult> {
    if (this.config.dailyCheckinStatus !== 'enabled') {
      return { status: 'skipped', reason: 'daily_checkin_not_enabled' };
    }
    const members: FeishuChatMember[] = await this.listAllHumanChatMembers();
    if (members.length !== 1) {
      throw new ServiceUnavailableException('daily check-in requires exactly one human member');
    }
    if (members[0].member_id !== this.config.dailyCheckinOwnerOpenId) {
      throw new ServiceUnavailableException('daily check-in sole human is not OfferLoop owner');
    }
    const records: FeishuRecord[] = await this.listPendingReminderRecords();
    const date: string = formatShanghaiDate();
    const card: Record<string, unknown> = buildDailyCheckinCard(
      date,
      records,
      this.config.reminderBaseUrl,
      this.config.reminderTasklistUrl,
    );
    const data: MessageSendData = await this.feishuRequest<MessageSendData>({
      method: 'POST',
      url: `${OPEN_API_ROOT}/im/v1/messages?receive_id_type=chat_id`,
      data: {
        receive_id: this.config.dailyCheckinChatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
        uuid: stableDailyMessageUuid(date),
      },
    });
    return {
      status: 'sent',
      messageId: data.message_id,
      eventCount: records.length,
    };
  }

  private async listAllHumanChatMembers(): Promise<FeishuChatMember[]> {
    const members: FeishuChatMember[] = [];
    let pageToken: string = '';
    let expectedTotal: number | null = null;
    for (let page: number = 0; page < 100; page += 1) {
      const suffix: string = pageToken
        ? `&page_token=${encodeURIComponent(pageToken)}`
        : '';
      const data: ChatMemberListData = await this.feishuRequest<ChatMemberListData>({
        method: 'GET',
        url: `${OPEN_API_ROOT}/im/v1/chats/`
          + `${encodeURIComponent(this.config.dailyCheckinChatId)}/members`
          + `?member_id_type=open_id&page_size=100&check_security_conf=true${suffix}`,
      });
      if (data.trigger_security_conf_limit) {
        throw new ServiceUnavailableException('daily check-in member list is truncated');
      }
      members.push(...(data.items ?? []));
      if (typeof data.member_total === 'number') {
        expectedTotal = data.member_total;
      }
      if (!data.has_more) {
        if (expectedTotal !== null && members.length !== expectedTotal) {
          throw new ServiceUnavailableException('daily check-in member list is incomplete');
        }
        return members;
      }
      pageToken = String(data.page_token ?? '');
      if (!pageToken) {
        throw new ServiceUnavailableException('daily check-in member pagination is incomplete');
      }
    }
    throw new ServiceUnavailableException('daily check-in member pagination exceeded safety limit');
  }

  private async applyReminderOutcome(
    reminderRecord: FeishuRecord,
    action: 'completed' | 'not_attended',
  ): Promise<ReminderOutcomeResult> {
    const currentCompletionStatus: string = readText(reminderRecord.fields['完成状态']);
    const targetCompletionStatus: string = action === 'completed' ? '已完成' : '已错过';
    if (
      currentCompletionStatus !== '待完成'
      && currentCompletionStatus !== targetCompletionStatus
    ) {
      throw new BadRequestException(
        `reminder is already ${currentCompletionStatus || 'in an unknown state'}`,
      );
    }
    const stage: string = readText(reminderRecord.fields['环节']);
    const completedNode: string = action === 'completed'
      ? EVENT_STAGE_TO_COMPLETED_NODE[stage] ?? ''
      : '';
    if (action === 'completed' && !completedNode) {
      throw new BadRequestException(`unsupported reminder stage: ${stage || 'unknown'}`);
    }
    const progressRecordId: string = readText(reminderRecord.fields['求职记录ID']);
    const progressRecord: FeishuRecord | null = progressRecordId
      ? await this.getProgressRecord(progressRecordId)
      : null;
    const progressStatus: string = progressRecord
      ? progressStatusFor(progressRecord.fields)
      : '';
    if (MANUAL_PROGRESS_STATUSES.has(progressStatus)) {
      throw new BadRequestException(`progress status is ${progressStatus}`);
    }
    const alreadyUpdated: boolean = currentCompletionStatus === targetCompletionStatus;
    if (!alreadyUpdated) {
      await this.updateReminderRecord(reminderRecord.record_id, {
        '完成状态': targetCompletionStatus,
      });
    }

    if (!progressRecordId || !progressRecord) {
      return {
        alreadyUpdated,
        nextStep: '待反馈',
        progressRecordFound: false,
        targetCompletionStatus,
      };
    }
    const pendingRecords: FeishuRecord[] = (await this.listPendingReminderRecords())
      .filter((record: FeishuRecord): boolean =>
        readText(record.fields['求职记录ID']) === progressRecordId
        && record.record_id !== reminderRecord.record_id)
      .sort((left: FeishuRecord, right: FeishuRecord): number =>
        (readDateMillis(left.fields['开始时间'] ?? left.fields['截止时间']) ?? Number.MAX_SAFE_INTEGER)
        - (readDateMillis(right.fields['开始时间'] ?? right.fields['截止时间']) ?? Number.MAX_SAFE_INTEGER));
    const nextStep: string = EVENT_STAGE_TO_NEXT_STEP[
      readText(pendingRecords[0]?.fields['环节'])
    ] ?? '待反馈';
    const progressFields: Record<string, unknown> = {
      '进展状态': NEXT_STEP_TO_PROGRESS_STATUS[nextStep] ?? '状态待确认',
      '下一环节': nextStep,
    };
    if (action === 'completed') {
      progressFields['最近完成节点'] = chooseLaterCompletedNode(
        readText(progressRecord.fields['最近完成节点']),
        completedNode,
      );
    }
    await this.updateProgressRecord(progressRecordId, progressFields);
    return {
      alreadyUpdated,
      nextStep,
      progressRecordFound: true,
      targetCompletionStatus,
    };
  }

  private async getTask(taskGuid: string): Promise<FeishuTask> {
    const data: TaskDetailData = await this.feishuRequest<TaskDetailData>({
      method: 'GET',
      url: `${OPEN_API_ROOT}/task/v2/tasks/${encodeURIComponent(taskGuid)}`
        + '?user_id_type=open_id',
    });
    return data.task;
  }

  private async ensureReminderTaskMapping(
    reminderRecord: FeishuRecord,
  ): Promise<{ record: FeishuRecord; provisioned: boolean }> {
    let taskGuid: string = readText(reminderRecord.fields['飞书任务GUID']);
    let missedTaskGuid: string = readText(reminderRecord.fields['未参加任务GUID']);
    let taskUrl: string = readUrl(reminderRecord.fields['飞书任务链接']);
    let provisioned: boolean = false;

    if (!taskGuid) {
      const stage: string = readText(reminderRecord.fields['环节']);
      const titleParts: string[] = [
        stage === '笔试' ? '笔试' : '面试',
        readText(reminderRecord.fields['公司']),
        readText(reminderRecord.fields['岗位']),
        stage,
      ].filter((part: string): boolean => Boolean(part));
      const dueAt: number | null = readDateMillis(reminderRecord.fields['开始时间'])
        ?? readDateMillis(reminderRecord.fields['截止时间']);
      const link: string = readUrl(reminderRecord.fields['链接']);
      const notes: string = readText(reminderRecord.fields['注意事项']);
      const descriptionParts: string[] = [
        `OfferLoop 事件：${reminderRecord.record_id}`,
        link ? `链接：${link}` : '',
        notes ? `注意事项：${notes}` : '',
      ].filter((part: string): boolean => Boolean(part));
      const payload: Record<string, unknown> = {
        summary: titleParts.join('｜'),
        description: descriptionParts.join('\n'),
        members: [{
          id: this.config.dailyCheckinOwnerOpenId,
          type: 'user',
          role: 'assignee',
        }],
        tasklists: [{ tasklist_guid: this.config.reminderTasklistGuid }],
        client_token: stableTaskClientToken(reminderRecord.record_id, 'completed'),
        extra: Buffer.from(JSON.stringify({
          source: 'offerloop',
          reminder_record_id: reminderRecord.record_id,
          outcome: 'completed',
        }), 'utf8').toString('base64'),
      };
      if (dueAt !== null) {
        payload.due = { timestamp: String(dueAt), is_all_day: false };
      }
      const data: TaskCreateData = await this.feishuRequest<TaskCreateData>({
        method: 'POST',
        url: `${OPEN_API_ROOT}/task/v2/tasks?user_id_type=open_id`,
        data: payload,
      });
      taskGuid = readText(data.task.guid);
      taskUrl = readUrl(data.task.url);
      if (!taskGuid) {
        throw new ServiceUnavailableException('created Feishu task has no GUID');
      }
      provisioned = true;
    }

    if (!missedTaskGuid) {
      const data: SubtaskCreateData = await this.feishuRequest<SubtaskCreateData>({
        method: 'POST',
        url: `${OPEN_API_ROOT}/task/v2/tasks/${encodeURIComponent(taskGuid)}`
          + '/subtasks?user_id_type=open_id',
        data: {
          summary: '未参加（仅未参加时勾选）',
          description: '只有确定未参加本次笔试或面试时才完成此子任务。',
          client_token: stableTaskClientToken(
            reminderRecord.record_id,
            'not_attended',
          ),
          extra: Buffer.from(JSON.stringify({
            source: 'offerloop',
            reminder_record_id: reminderRecord.record_id,
            outcome: 'not_attended',
          }), 'utf8').toString('base64'),
        },
      });
      missedTaskGuid = readText(data.subtask.guid);
      if (!missedTaskGuid) {
        throw new ServiceUnavailableException('created Feishu subtask has no GUID');
      }
      provisioned = true;
    }

    if (!taskUrl) {
      taskUrl = `https://applink.feishu.cn/client/todo/detail?guid=${encodeURIComponent(taskGuid)}`;
    }
    const mappingFields: Record<string, unknown> = {
      '飞书任务GUID': taskGuid,
      '未参加任务GUID': missedTaskGuid,
      '飞书任务链接': { link: taskUrl, text: '打开飞书任务' },
    };
    const mappingChanged: boolean = (
      readText(reminderRecord.fields['飞书任务GUID']) !== taskGuid
      || readText(reminderRecord.fields['未参加任务GUID']) !== missedTaskGuid
      || readUrl(reminderRecord.fields['飞书任务链接']) !== taskUrl
    );
    if (mappingChanged) {
      await this.updateReminderRecord(reminderRecord.record_id, mappingFields);
    }
    return {
      record: {
        ...reminderRecord,
        fields: { ...reminderRecord.fields, ...mappingFields },
      },
      provisioned,
    };
  }

  private async listPendingReminderRecords(): Promise<FeishuRecord[]> {
    const records: FeishuRecord[] = [];
    let pageToken: string = '';
    for (let page: number = 0; page < 100; page += 1) {
      const suffix: string = pageToken
        ? `&page_token=${encodeURIComponent(pageToken)}`
        : '';
      const data: RecordSearchData = await this.feishuRequest<RecordSearchData>({
        method: 'POST',
        url: `${OPEN_API_ROOT}/bitable/v1/apps/`
          + `${this.config.reminderBaseToken}/tables/${this.config.reminderTableId}`
          + `/records/search?page_size=100${suffix}`,
        data: {
          filter: {
            conjunction: 'and',
            conditions: [{
              field_name: '完成状态',
              operator: 'is',
              value: ['待完成'],
            }],
          },
        },
      });
      records.push(...(data.items ?? []));
      if (!data.has_more) {
        return records;
      }
      pageToken = String(data.page_token ?? '');
      if (!pageToken) {
        throw new ServiceUnavailableException('reminder record pagination is incomplete');
      }
    }
    throw new ServiceUnavailableException('reminder record pagination exceeded safety limit');
  }

  private async updateReminderRecord(
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const url: string = `${OPEN_API_ROOT}/bitable/v1/apps/`
      + `${this.config.reminderBaseToken}/tables/${this.config.reminderTableId}`
      + `/records/${encodeURIComponent(recordId)}`;
    await this.feishuRequest<RecordDetailData>({
      method: 'PUT',
      url,
      data: { fields },
    });
  }

  private async getProgressRecord(recordId: string): Promise<FeishuRecord> {
    const url: string = `${OPEN_API_ROOT}/bitable/v1/apps/`
      + `${this.config.progressBaseToken}/tables/${this.config.progressTableId}`
      + `/records/${encodeURIComponent(recordId)}`;
    const data: RecordDetailData = await this.feishuRequest<RecordDetailData>({
      method: 'GET',
      url,
    });
    return data.record;
  }

  private async getSourceRecord(recordId: string): Promise<FeishuRecord> {
    const url: string = `${OPEN_API_ROOT}/bitable/v1/apps/`
      + `${this.config.sourceBaseToken}/tables/${this.config.sourceTableId}`
      + `/records/${encodeURIComponent(recordId)}`;
    const data: RecordDetailData = await this.feishuRequest<RecordDetailData>({
      method: 'GET',
      url,
    });
    return data.record;
  }

  private async findProgressRecords(sourceRecordId: string): Promise<FeishuRecord[]> {
    const items: FeishuRecord[] = [];
    let pageToken: string = '';
    do {
      const query: URLSearchParams = new URLSearchParams({ page_size: '500' });
      if (pageToken) {
        query.set('page_token', pageToken);
      }
      const url: string = `${OPEN_API_ROOT}/bitable/v1/apps/`
        + `${this.config.progressBaseToken}/tables/${this.config.progressTableId}`
        + `/records/search?${query.toString()}`;
      const data: RecordSearchData = await this.feishuRequest<RecordSearchData>({
        method: 'POST',
        url,
        data: {
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: '企业清单 record_id',
                operator: 'is',
                value: [sourceRecordId],
              },
            ],
          },
        },
      });
      items.push(...(data.items ?? []));
      pageToken = data.has_more ? String(data.page_token ?? '') : '';
    } while (pageToken);
    return items;
  }

  private async createProgressRecord(fields: Record<string, unknown>): Promise<string> {
    const sourceRecordId: string = readText(fields['企业清单 record_id']);
    const clientToken: string = stableClientToken(sourceRecordId);
    const url: string = `${OPEN_API_ROOT}/bitable/v1/apps/`
      + `${this.config.progressBaseToken}/tables/${this.config.progressTableId}`
      + `/records?client_token=${encodeURIComponent(clientToken)}`;
    const data: RecordCreateData = await this.feishuRequest<RecordCreateData>({
      method: 'POST',
      url,
      data: { fields: toWritableFields(fields) },
    });
    return data.record.record_id;
  }

  private async updateProgressRecord(
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const url: string = `${OPEN_API_ROOT}/bitable/v1/apps/`
      + `${this.config.progressBaseToken}/tables/${this.config.progressTableId}`
      + `/records/${encodeURIComponent(recordId)}`;
    await this.feishuRequest<RecordDetailData>({
      method: 'PUT',
      url,
      data: { fields: toWritableFields(fields) },
    });
  }

  private async feishuRequest<T>(config: AxiosRequestConfig): Promise<T> {
    return this.withRetry<T>(async (): Promise<T> => {
      const accessToken: string = await this.getTenantAccessToken();
      try {
        const response: AxiosResponse<FeishuApiResponse<T>> = await firstValueFrom(
          this.httpService.request<FeishuApiResponse<T>>({
            ...config,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              Authorization: `Bearer ${accessToken}`,
              ...config.headers,
            },
          }),
        );
        if (response.data.code !== 0 || !response.data.data) {
          throw new Error(
            `Feishu API request failed: ${response.data.code} ${response.data.msg ?? ''}`.trim(),
          );
        }
        return response.data.data;
      } catch (error: unknown) {
        throw new Error(`Feishu API request failed: ${errorMessage(error)}`);
      }
    });
  }

  private async getTenantAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }
    try {
      const response: AxiosResponse<FeishuTokenResponse> = await firstValueFrom(
        this.httpService.request<FeishuTokenResponse>({
          method: 'POST',
          url: TOKEN_URL,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          data: {
            app_id: this.config.appId,
            app_secret: this.config.appSecret,
          },
        }),
      );
      const token: string = String(response.data.tenant_access_token ?? '');
      if (response.data.code !== 0 || !token) {
        throw new Error(
          `Feishu token request failed: ${response.data.code} ${response.data.msg ?? ''}`.trim(),
        );
      }
      const lifetimeSeconds: number = Math.max(
        Number(response.data.expire ?? 7200) - 300,
        60,
      );
      this.cachedToken = token;
      this.tokenExpiresAt = Date.now() + lifetimeSeconds * 1000;
      return token;
    } catch (error: unknown) {
      throw new Error(`Feishu token request failed: ${errorMessage(error)}`);
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown = new Error('operation did not run');
    for (let attempt: number = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error;
        if (attempt < 3) {
          await new Promise<void>((resolve: () => void): void => {
            setTimeout(resolve, attempt * 250);
          });
        }
      }
    }
    const diagnostic: string = errorMessage(lastError);
    this.logger.error(diagnostic);
    throw new ServiceUnavailableException(
      `Feishu service is temporarily unavailable: ${diagnostic}`,
    );
  }
}
