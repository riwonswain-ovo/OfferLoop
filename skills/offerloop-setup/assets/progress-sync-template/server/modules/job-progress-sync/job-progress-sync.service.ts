import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isAxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { isDeepStrictEqual } from 'util';
import { firstValueFrom } from 'rxjs';
import {
  deriveAsyncWindow,
  adjustmentRetryCard,
  emptyCheckinCard,
  conflictConfirmationCard,
  groupPendingRecords,
  isAsyncAdjustable,
  operationRetryCard,
  paginateCheckinGroups,
  parseCheckinAction,
  populatedCheckinCard,
  rescheduleCard,
  validateCurrentCheckinAction,
} from './daily-checkin';

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
  'REMINDER_RECONCILE_SECRET',
  'RUNTIME_STATE_TABLE_ID',
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

class FeishuRequestError extends Error {
  constructor(message: string, readonly outcomeUnknown: boolean = false) {
    super(message);
    this.name = 'FeishuRequestError';
  }
}

interface FeishuRecord {
  record_id: string;
  fields: Record<string, unknown>;
  last_modified_time?: string;
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
  reminderReconcileSecret: string;
  dailyCheckinStatus: 'enabled' | 'disabled';
  dailyCheckinChatId: string;
  dailyCheckinOwnerOpenId: string;
  dailyCheckinCalendarId: string;
  runtimeStateTableId: string;
}

interface ReminderOutcomeResult {
  alreadyUpdated: boolean;
  nextStep: string;
  progressRecordFound: boolean;
  targetCompletionStatus: string;
}

export interface ReminderReconcileResult {
  ok: true;
  action: 'reconciled';
  recordId: string;
  completionStatus: string;
}

function requireDeploymentConfig(env: NodeJS.ProcessEnv): DeploymentConfig {
  for (const name of REQUIRED_ENV_NAMES) {
    if (!String(env[name] ?? '').trim()) {
      throw new Error(`missing required environment variable: ${name}`);
    }
  }
  const dailyCheckinStatus: 'enabled' | 'disabled' = env.DAILY_CHECKIN_STATUS === 'enabled'
    ? 'enabled'
    : 'disabled';
  if (dailyCheckinStatus === 'enabled') {
    for (const name of ['DAILY_CHECKIN_CHAT_ID', 'DAILY_CHECKIN_OWNER_OPEN_ID', 'DAILY_CHECKIN_CALENDAR_ID']) {
      if (!String(env[name] ?? '').trim()) {
        throw new Error(`missing required environment variable for enabled daily check-in: ${name}`);
      }
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
    reminderReconcileSecret: String(env.REMINDER_RECONCILE_SECRET),
    dailyCheckinStatus,
    dailyCheckinChatId: String(env.DAILY_CHECKIN_CHAT_ID),
    dailyCheckinOwnerOpenId: String(env.DAILY_CHECKIN_OWNER_OPEN_ID),
    dailyCheckinCalendarId: String(env.DAILY_CHECKIN_CALENDAR_ID),
    runtimeStateTableId: String(env.RUNTIME_STATE_TABLE_ID),
  };
}

const EVENT_STAGE_TO_COMPLETED_NODE: Record<string, string> = {
  '测评': '测评完成',
  '笔试': '笔试完成',
  '群面': '群面完成',
  '一面': '一面完成',
  '二面': '二面完成',
  '三面': '三面完成',
  'HR面': 'HR面完成',
  '面试': '面试完成',
};

const EVENT_STAGE_TO_NEXT_STEP: Record<string, string> = {
  '测评': '测评',
  '笔试': '笔试',
  '群面': '群面',
  '一面': '一面',
  '二面': '二面',
  '三面': '三面',
  'HR面': 'HR面',
  '面试': '面试',
};

const NEXT_STEP_TO_PROGRESS_STATUS: Record<string, string> = {
  '待反馈': '待反馈',
  '测评': '待测评',
  '笔试': '待笔试',
  '面试': '待面试',
  '群面': '待群面',
  '一面': '待一面',
  '二面': '待二面',
  '三面': '待三面',
  'HR面': '待 HR 面',
  'OC': '待 OC',
};

const MANUAL_PROGRESS_STATUSES: Set<string> = new Set([
  'Offer', '未通过', '主动放弃', '岗位关闭',
]);

const PROGRESS_STATUS_RANK: Record<string, number> = {
  '待反馈': 0,
  '待测评': 1,
  '待笔试': 2,
  '待群面': 3,
  '待一面': 4,
  '待二面': 5,
  '待三面': 6,
  '待面试': 7,
  '待 HR 面': 8,
  '待 OC': 9,
};

const COMPLETED_NODE_RANK: Record<string, number> = {
  '投递完成': 1,
  '测评完成': 2,
  '笔试完成': 3,
  '群面完成': 4,
  '一面完成': 5,
  '二面完成': 6,
  '三面完成': 7,
  '面试完成': 8,
  'HR面完成': 9,
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
  return current || '状态待确认';
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

function readProgressRecordIds(value: unknown): string[] {
  const ids: string[] = [];
  const append = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(append);
      return;
    }
    const text: string = readText(candidate);
    if (!text) {
      return;
    }
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        append(JSON.parse(text) as unknown);
        return;
      } catch {
        // Preserve malformed legacy values for the existing validation path.
      }
    }
    ids.push(text);
  };
  if (typeof value === 'string') {
    const text: string = value.trim();
    if (!text) {
      return [];
    }
    try {
      append(JSON.parse(text) as unknown);
    } catch {
      append(text);
    }
  } else {
    append(value);
  }
  return [...new Set(ids)];
}

function canDeleteGeneratedDefault(
  record: FeishuRecord,
  sourceRecordId: string,
): boolean {
  const fields: Record<string, unknown> = record.fields ?? {};
  const progressStatus: string = readText(fields['进展状态']);
  const completed: string = readText(fields['最近完成节点']);
  return readText(fields['投递记录 ID']) === `enterprise:${sourceRecordId}:default`
    && !readText(fields['投递岗位'])
    && !readText(fields['岗位 JD'])
    && progressStatus === '待反馈'
    && completed === '投递完成';
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

function formatShanghaiDate(value?: string | Date): string {
  const parsed: Date = value instanceof Date
    ? value
    : value && !Number.isNaN(Date.parse(value)) ? new Date(value) : new Date();
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

function compareReminderTime(left: FeishuRecord, right: FeishuRecord): number {
  const leftTime: number = readDateMillis(
    left.fields['开始时间'] ?? left.fields['截止时间'],
  ) ?? Number.MAX_SAFE_INTEGER;
  const rightTime: number = readDateMillis(
    right.fields['开始时间'] ?? right.fields['截止时间'],
  ) ?? Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime;
}

function compareReminderProgress(left: FeishuRecord, right: FeishuRecord): number {
  const progressRank = (record: FeishuRecord): number => {
    const nextStep: string = EVENT_STAGE_TO_NEXT_STEP[
      readText(record.fields['环节'])
    ] ?? '';
    return PROGRESS_STATUS_RANK[NEXT_STEP_TO_PROGRESS_STATUS[nextStep]] ?? -1;
  };
  return progressRank(left) - progressRank(right) || compareReminderTime(left, right);
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

function calendarDescription(fields: Record<string, unknown>, marker: string): string {
  const clean = (value: unknown, limit: number): string => readText(value)
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .slice(0, limit);
  const lines: string[] = [];
  const platform: string = clean(fields['平台'], 80);
  const link: string = clean(readUrl(fields['链接']), 500);
  const notes: string = clean(fields['注意事项'], 500);
  if (platform) lines.push(`平台：${platform}`);
  if (/^https?:\/\//u.test(link)) lines.push(`参与链接：${link}`);
  if (notes) lines.push(`提醒：${notes}`);
  lines.push(marker);
  return lines.join('\n').slice(0, 2000);
}

function isTransientError(error: unknown): boolean {
  const message: string = errorMessage(error);
  return /(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|http=(?:408|409|425|429|500|502|503|504)\b|code=(?:90002|99991663)\b)/iu.test(message);
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
    const existingRecords: FeishuRecord[] = await this.findProgressRecords(
      request.sourceRecordId,
    );
    if (!statuses.includes('已投递')) {
      const deletable: FeishuRecord[] = existingRecords.filter(
        (record: FeishuRecord): boolean => canDeleteGeneratedDefault(
          record,
          request.sourceRecordId,
        ),
      );
      const protectedRecords: FeishuRecord[] = existingRecords.filter(
        (record: FeishuRecord): boolean => !canDeleteGeneratedDefault(
          record,
          request.sourceRecordId,
        ),
      );
      for (const record of deletable) {
        await this.deleteProgressRecord(record.record_id);
      }
      return {
        ok: true,
        action: protectedRecords.length > 0
          ? 'review_required'
          : deletable.length > 0 ? 'deleted' : 'unchanged',
        recordId: existingRecords[0]?.record_id ?? '',
        matchedCount: existingRecords.length,
        deletedCount: deletable.length,
        protectedCount: protectedRecords.length,
      };
    }

    const company: string = readText(sourceRecord.fields['公司']);
    if (!company) {
      throw new BadRequestException('source record company is empty');
    }

    const announcementUrl: string = readUrl(sourceRecord.fields['公告链接']);
    const applicationUrl: string = readUrl(sourceRecord.fields['投递链接']);
    const submittedDate: string = formatShanghaiDate(request.transitionedAt);

    if (existingRecords.length === 0) {
      const fields: Record<string, unknown> = {
        '进展状态': '待反馈',
        '最近完成节点': '投递完成',
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
        '最近完成节点': readText(existing.fields['最近完成节点']) || '投递完成',
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

  async sendDailyCheckin(now: Date = new Date()): Promise<{ sent: boolean; count: number }> {
    if (this.config.dailyCheckinStatus !== 'enabled') return { sent: false, count: 0 };
    const records: FeishuRecord[] = await this.listReminderRecordsByStatus('待完成');
    const groups = groupPendingRecords(records, now);
    const count: number = Object.values(groups).reduce((sum, items) => sum + items.length, 0);
    const pages = count > 0 ? paginateCheckinGroups(groups) : [groups];
    for (const [index, page] of pages.entries()) {
      const card: Record<string, unknown> = count > 0 ? populatedCheckinCard(page) : emptyCheckinCard();
      const uuid: string = createHash('sha256')
        .update(`daily-card:${this.config.dailyCheckinChatId}:${formatShanghaiDate(now)}:${index}`)
        .digest('hex').slice(0, 40);
      const existing = await this.findRuntimeState(uuid);
      const existingStatus: string = readText(existing?.fields['状态']);
      if (existingStatus === '已发送') continue;
      if (existingStatus === '发送中' || existingStatus === '发送结果未知') {
        throw new ServiceUnavailableException(`daily card page ${index + 1} has an unknown prior delivery result; verify the group before retrying`);
      }
      const ledgerRecordId: string = existing?.record_id || await this.createDailyPageLedger(uuid, now, index);
      await this.updateDailyPageLedger(ledgerRecordId, { '状态': '发送中', '错误': '' });
      try {
        const sent = await this.feishuRequest<{ message_id?: string }>({
          method: 'POST',
          url: `${OPEN_API_ROOT}/im/v1/messages?receive_id_type=chat_id`,
          data: { receive_id: this.config.dailyCheckinChatId, msg_type: 'interactive', content: JSON.stringify(card), uuid },
        });
        await this.updateDailyPageLedger(ledgerRecordId, {
          '状态': '已发送',
          '消息ID': readText(sent.message_id),
          '错误': '',
        });
      } catch (error: unknown) {
        const unknown: boolean = error instanceof FeishuRequestError && error.outcomeUnknown;
        await this.updateDailyPageLedger(ledgerRecordId, {
          '状态': unknown ? '发送结果未知' : '发送失败',
          '错误': errorMessage(error).slice(0, 500),
        });
        throw error;
      }
    }
    return { sent: true, count };
  }

  async handleDailyCheckinAction(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.config.dailyCheckinStatus !== 'enabled') {
      throw new BadRequestException('daily check-in is disabled');
    }
    const parsed = parseCheckinAction(payload, this.config.dailyCheckinOwnerOpenId);
    const record: FeishuRecord = await this.getReminderRecord(parsed.recordId);
    const completionStatus: string = readText(record.fields['完成状态']);
    const requestedStart: string = parsed.action === 'adjust_confirmed' || parsed.action === 'adjust_retry'
      ? parsed.plannedStart
      : (() => {
        const date: string = readText(parsed.formValue.planned_date);
        const start: string = readText(parsed.formValue.planned_start);
        return date && start ? `${date}T${start}:00+08:00` : '';
      })();
    const requestedStartMillis: number = Date.parse(requestedStart);
    const currentStartMillis: number = Date.parse(readText(record.fields['开始时间']));
    const exactAdjustmentReplay: boolean = parsed.action.startsWith('adjust')
      && readText(record.fields['事件状态']) === '有效'
      && !Number.isNaN(requestedStartMillis)
      && requestedStartMillis === currentStartMillis;
    if (completionStatus === '待完成') {
      try {
        validateCurrentCheckinAction(record, parsed.action);
      } catch (error: unknown) {
        if (!exactAdjustmentReplay) {
          return { toast: { type: 'warning', content: `该卡片已过期：${errorMessage(error)}` } };
        }
      }
    }
    if (parsed.action === 'not_completed') {
      if (completionStatus !== '待完成') {
        return { toast: { type: 'warning', content: '状态已变化，本次操作未覆盖现有结果' } };
      }
      if (!isAsyncAdjustable(record)) {
        return { toast: { type: 'warning', content: '固定时间事件不能调整，请选择已完成或已错过' } };
      }
      return { toast: { type: 'info', content: '请选择新的开始时间' }, card: { type: 'raw', data: rescheduleCard(parsed.recordId) } };
    }
    if (parsed.action === 'adjust' && Object.keys(parsed.formValue).length === 0) {
      if (completionStatus !== '待完成') {
        return { toast: { type: 'warning', content: '状态已变化，本次操作未覆盖现有结果' } };
      }
      if (!isAsyncAdjustable(record)) {
        return { toast: { type: 'warning', content: '固定时间事件不能调整，请选择已完成或已错过' } };
      }
      return { toast: { type: 'info', content: '请选择计划开始时间' }, card: { type: 'raw', data: rescheduleCard(parsed.recordId) } };
    }
    if (parsed.action === 'completed' || parsed.action === 'missed') {
      const targetStatus: string = parsed.action === 'completed' ? '已完成' : '已错过';
      if (completionStatus === targetStatus) {
        if (parsed.action === 'completed') {
          try {
            await this.reconcileReminderRecord(parsed.recordId, true);
            return { toast: { type: 'info', content: '此前已标记完成，关联进展已核对' } };
          } catch (error: unknown) {
            if (errorMessage(error).includes('already in progress') || errorMessage(error).includes('another worker')) {
              return { toast: { type: 'info', content: '关联进展正在同步，请稍后查看' } };
            }
            return {
              toast: { type: 'error', content: `求职进展联动失败：${errorMessage(error)}` },
              card: { type: 'raw', data: operationRetryCard(parsed.recordId, 'completed', '求职进展联动') },
            };
          }
        }
        return { toast: { type: 'info', content: '此前已标记错过' } };
      }
      if (completionStatus !== '待完成') {
        return { toast: { type: 'warning', content: '状态已变化，本次操作未覆盖现有结果' } };
      }
      try {
        await this.updateReminderRecord(parsed.recordId, { '完成状态': targetStatus });
        if (parsed.retryFailedStep === 'Base 状态写入') {
          await this.tryResolveRuntimeFailure(
            `daily-completion:${parsed.recordId}:${targetStatus}`,
            parsed.recordId,
            'base_completion_status',
          );
        }
      } catch (error: unknown) {
        await this.tryRecordRuntimeFailure(`daily-completion:${parsed.recordId}:${targetStatus}`, parsed.recordId, 'base_completion_status', error);
        return {
          toast: { type: 'error', content: `Base 状态写入失败：${errorMessage(error)}` },
          card: { type: 'raw', data: operationRetryCard(parsed.recordId, parsed.action, 'Base 状态写入') },
        };
      }
      if (parsed.action === 'completed') {
        try {
          await this.reconcileReminderRecord(parsed.recordId, parsed.retryFailedStep === '求职进展联动');
        } catch (error: unknown) {
          if (errorMessage(error).includes('already in progress') || errorMessage(error).includes('another worker')) {
            return { toast: { type: 'info', content: '已标记完成，关联进展正在同步' } };
          }
          return {
            toast: { type: 'error', content: `求职进展联动失败：${errorMessage(error)}` },
            card: { type: 'raw', data: operationRetryCard(parsed.recordId, 'completed', '求职进展联动') },
          };
        }
      }
      return { toast: { type: 'success', content: parsed.action === 'completed' ? '已标记完成' : '已标记错过' } };
    }
    if (completionStatus !== '待完成') {
      return { toast: { type: 'warning', content: '状态已变化，本次操作未覆盖现有结果' } };
    }
    let window: { start: string; end: string };
    try {
      window = deriveAsyncWindow(record, requestedStart);
    } catch (error: unknown) {
      const message: string = errorMessage(error);
      const content: string = message.includes('future')
        ? '请选择未来的开始时间'
        : message.includes('deadline')
          ? '所选时间无法在招聘方截止前完成，请重新选择'
          : message.includes('duration')
            ? '事件时长无效，请先检查 Base 中的预计时长'
            : '请选择有效的日期和开始时间';
      return {
        toast: { type: 'warning', content },
        card: { type: 'raw', data: rescheduleCard(parsed.recordId) },
      };
    }
    const rawEventId: string = readText(record.fields['已建日程ID']);
    const existingEventId: string = rawEventId.startsWith('pending:') ? '' : rawEventId;
    if (parsed.action !== 'adjust_confirmed') {
      try {
        if (await this.hasCalendarConflict(window.start, window.end, existingEventId)) {
          return {
            toast: { type: 'warning', content: '所选时间与现有日程冲突，请确认是否继续' },
            card: { type: 'raw', data: conflictConfirmationCard(parsed.recordId, window.start) },
          };
        }
        if (parsed.action === 'adjust_retry') {
          await this.tryResolveRuntimeFailure(
            `daily-adjust:${parsed.recordId}:${window.start}:conflict`,
            parsed.recordId,
            'calendar_conflict_check',
          );
        }
      } catch (error: unknown) {
        try {
          await this.updateReminderRecord(parsed.recordId, { '日历状态': '操作失败' });
        } catch (statusError: unknown) {
          this.logger.error(`calendar conflict failure status write failed for ${parsed.recordId}: ${errorMessage(statusError)}`);
        }
        await this.tryRecordRuntimeFailure(`daily-adjust:${parsed.recordId}:${window.start}:conflict`, parsed.recordId, 'calendar_conflict_check', error);
        return {
          toast: { type: 'error', content: `日历冲突检查失败：${errorMessage(error)}` },
          card: { type: 'raw', data: adjustmentRetryCard(parsed.recordId, window.start, false) },
        };
      }
    }
    const actionKey: string = createHash('sha256')
      .update(`daily-adjust:${parsed.recordId}:${window.start}`)
      .digest('hex').slice(0, 24);
    const marker: string = `OfferLoop action ${actionKey}`;
    let eventId: string = rawEventId.startsWith('pending:') ? '' : rawEventId;
    const markerDescription: string = calendarDescription(record.fields, marker);
    const calendarData = {
      summary: readText(record.fields['安排名称']),
      description: markerDescription,
      start_time: { timestamp: String(Date.parse(window.start) / 1000), timezone: 'Asia/Shanghai' },
      end_time: { timestamp: String(Date.parse(window.end) / 1000), timezone: 'Asia/Shanghai' },
    };
    try {
      if (!eventId && rawEventId.startsWith('pending:')) {
        const previousStartMillis: number | null = readDateMillis(record.fields['开始时间']);
        const previousEndMillis: number | null = readDateMillis(record.fields['结束时间']);
        if (previousStartMillis !== null && previousEndMillis !== null) {
          eventId = await this.findCalendarEventByMarker(
            `OfferLoop action ${rawEventId.slice('pending:'.length)}`,
            readText(record.fields['安排名称']),
            new Date(previousStartMillis).toISOString(),
            new Date(previousEndMillis).toISOString(),
          );
        }
      }
      if (!eventId) {
        await this.updateReminderRecord(parsed.recordId, {
          '开始时间': window.start,
          '结束时间': window.end,
          '日历状态': '待安排',
          '已建日程ID': `pending:${actionKey}`,
        });
      }
      let finalEventId: string = eventId;
      if (finalEventId) {
        await this.feishuRequest<Record<string, unknown>>({ method: 'PATCH', url: `${OPEN_API_ROOT}/calendar/v4/calendars/${encodeURIComponent(this.config.dailyCheckinCalendarId)}/events/${encodeURIComponent(finalEventId)}`, data: calendarData });
      } else {
        finalEventId = await this.findCalendarEventByMarker(
          marker,
          readText(record.fields['安排名称']),
          window.start,
          window.end,
        );
        if (!finalEventId) {
          const created = await this.feishuRequest<{ event: { event_id: string } }>({ method: 'POST', url: `${OPEN_API_ROOT}/calendar/v4/calendars/${encodeURIComponent(this.config.dailyCheckinCalendarId)}/events?idempotency_key=${encodeURIComponent(actionKey)}`, data: calendarData });
          finalEventId = created.event.event_id;
        }
      }
      await this.updateReminderRecord(parsed.recordId, { '开始时间': window.start, '结束时间': window.end, '日历状态': '已建日程', '已建日程ID': finalEventId });
      if (parsed.retryFailedStep === 'calendar_upsert') {
        await this.tryResolveRuntimeFailure(
          `daily-adjust:${parsed.recordId}:${window.start}`,
          parsed.recordId,
          'calendar_upsert',
        );
      }
      return { toast: { type: 'success', content: '日程已调整' } };
    } catch (error: unknown) {
      try {
        await this.updateReminderRecord(parsed.recordId, { '日历状态': '操作失败' });
      } catch (statusError: unknown) {
        this.logger.error(`calendar failure status write failed for ${parsed.recordId}: ${errorMessage(statusError)}`);
      }
      await this.tryRecordRuntimeFailure(`daily-adjust:${parsed.recordId}:${window.start}`, parsed.recordId, 'calendar_upsert', error);
      return {
        toast: { type: 'error', content: `日历调整失败：${errorMessage(error)}` },
        card: { type: 'raw', data: adjustmentRetryCard(parsed.recordId, window.start) },
      };
    }
  }

  private async hasCalendarConflict(start: string, end: string, excludedEventId: string = ''): Promise<boolean> {
    const data = await this.feishuRequest<{ freebusy_list?: Array<Record<string, unknown>> }>({
      method: 'POST',
      url: `${OPEN_API_ROOT}/calendar/v4/freebusy/list?user_id_type=open_id`,
      data: { time_min: start, time_max: end, user_id: this.config.dailyCheckinOwnerOpenId },
    });
    const conflicts: Array<Record<string, unknown>> = data.freebusy_list ?? [];
    if (!excludedEventId || conflicts.length === 0) return conflicts.length > 0;
    const withIds = conflicts.filter((item: Record<string, unknown>): boolean => (
      readText(item.event_id || item.calendar_event_id || item.uid) !== excludedEventId
    ));
    if (conflicts.some((item: Record<string, unknown>): boolean => (
      Boolean(readText(item.event_id || item.calendar_event_id || item.uid))
    ))) return withIds.length > 0;
    // Some Feishu tenants omit event IDs from freebusy.  In that case fetch
    // the current OfferLoop event and subtract exactly one overlapping slot.
    try {
      const detail = await this.feishuRequest<{ event?: { start_time?: { timestamp?: string }; end_time?: { timestamp?: string } } }>({
        method: 'GET',
        url: `${OPEN_API_ROOT}/calendar/v4/calendars/${encodeURIComponent(this.config.dailyCheckinCalendarId)}/events/${encodeURIComponent(excludedEventId)}`,
      });
      const ownStart: number = Number(detail.event?.start_time?.timestamp ?? 0) * 1000;
      const ownEnd: number = Number(detail.event?.end_time?.timestamp ?? 0) * 1000;
      const overlaps: boolean = ownStart < Date.parse(end) && ownEnd > Date.parse(start);
      return conflicts.length > (overlaps ? 1 : 0);
    } catch {
      return true;
    }
  }

  private async findCalendarEventByMarker(marker: string, summary: string, start: string, end: string): Promise<string> {
    if (!summary) return '';
    const query = new URLSearchParams({ page_size: '30' });
    let pageToken: string = '';
    do {
      if (pageToken) query.set('page_token', pageToken);
      const data = await this.feishuRequest<{ items?: Array<{ meta_data?: { event_id?: string } }>; has_more?: boolean; page_token?: string }>({
        method: 'POST',
        url: `${OPEN_API_ROOT}/calendar/v4/calendars/${encodeURIComponent(this.config.dailyCheckinCalendarId)}/events/search_event?${query.toString()}`,
        data: {
          query: summary,
          filter: {
            calendar_ids: [this.config.dailyCheckinCalendarId],
            time_range: { start_time: start, end_time: end },
          },
        },
      });
      for (const item of data.items ?? []) {
        const candidateId: string = readText(item.meta_data?.event_id);
        if (!candidateId) continue;
        const detail = await this.feishuRequest<{ event: { event_id?: string; description?: string } }>({
          method: 'GET',
          url: `${OPEN_API_ROOT}/calendar/v4/calendars/${encodeURIComponent(this.config.dailyCheckinCalendarId)}/events/${encodeURIComponent(candidateId)}`,
        });
        if (readText(detail.event.description).includes(marker)) return readText(detail.event.event_id) || candidateId;
      }
      pageToken = data.has_more ? readText(data.page_token) : '';
    } while (pageToken);
    return '';
  }

  private async findRuntimeState(idempotencyKey: string): Promise<FeishuRecord | undefined> {
    const data = await this.feishuRequest<RecordSearchData>({
      method: 'POST',
      url: `${OPEN_API_ROOT}/bitable/v1/apps/${this.config.reminderBaseToken}/tables/${this.config.runtimeStateTableId}/records/search?page_size=2`,
      data: { filter: { conjunction: 'and', conditions: [{ field_name: '幂等键', operator: 'is', value: [idempotencyKey] }] } },
    });
    const items: FeishuRecord[] = data.items ?? [];
    if (items.length > 1) throw new ServiceUnavailableException(`duplicate daily-card ledger key: ${idempotencyKey}`);
    return items[0];
  }

  private async createDailyPageLedger(idempotencyKey: string, now: Date, pageIndex: number): Promise<string> {
    const clientToken: string = createHash('sha256').update(`daily-ledger:${idempotencyKey}`).digest('hex').slice(0, 32);
    const data = await this.feishuRequest<RecordCreateData>({
      method: 'POST',
      url: `${OPEN_API_ROOT}/bitable/v1/apps/${this.config.reminderBaseToken}/tables/${this.config.runtimeStateTableId}/records?client_token=${clientToken}`,
      data: { fields: { '幂等键': idempotencyKey, '类型': 'daily_card_page', '状态': '发送中', '来源ID': this.config.dailyCheckinChatId, '步骤': `page:${pageIndex + 1}`, '日期': formatShanghaiDate(now), '分页序号': pageIndex + 1, '消息ID': '', '错误': '', '更新时间': Date.now() } },
    });
    return data.record.record_id;
  }

  private async updateDailyPageLedger(recordId: string, fields: Record<string, unknown>): Promise<void> {
    await this.feishuRequest<RecordDetailData>({
      method: 'PUT',
      url: `${OPEN_API_ROOT}/bitable/v1/apps/${this.config.reminderBaseToken}/tables/${this.config.runtimeStateTableId}/records/${encodeURIComponent(recordId)}`,
      data: { fields },
    });
  }

  private async writeRuntimeState(idempotencyKey: string, fields: Record<string, unknown>): Promise<void> {
    const existing = await this.findRuntimeState(idempotencyKey);
    const payload: Record<string, unknown> = { '幂等键': idempotencyKey, ...fields, '更新时间': Date.now() };
    if (existing) {
      await this.updateDailyPageLedger(existing.record_id, payload);
      return;
    }
    const clientToken: string = createHash('sha256').update(`runtime-state:${idempotencyKey}`).digest('hex').slice(0, 32);
    await this.feishuRequest<RecordCreateData>({
      method: 'POST',
      url: `${OPEN_API_ROOT}/bitable/v1/apps/${this.config.reminderBaseToken}/tables/${this.config.runtimeStateTableId}/records?client_token=${clientToken}`,
      data: { fields: payload },
    });
  }

  private async tryRecordRuntimeFailure(idempotencyKey: string, sourceId: string, step: string, error: unknown): Promise<void> {
    try {
      await this.writeRuntimeState(idempotencyKey, {
        '类型': 'operation_failure', '状态': '失败', '来源ID': sourceId,
        '步骤': step, '错误': errorMessage(error).slice(0, 500),
      });
    } catch (ledgerError: unknown) {
      this.logger.error(`runtime failure ledger write failed for ${sourceId}: ${errorMessage(ledgerError)}`);
    }
  }

  private async tryResolveRuntimeFailure(idempotencyKey: string, sourceId: string, step: string): Promise<void> {
    try {
      const existing = await this.findRuntimeState(idempotencyKey);
      if (existing && readText(existing.fields['状态']) === '失败') {
        await this.updateDailyPageLedger(existing.record_id, {
          '状态': '成功', '来源ID': sourceId, '步骤': step, '错误': '', '更新时间': Date.now(),
        });
      }
    } catch (ledgerError: unknown) {
      this.logger.error(`runtime failure resolution failed for ${sourceId}: ${errorMessage(ledgerError)}`);
    }
  }

  private async claimReminderReconcile(
    idempotencyKey: string,
    sourceId: string,
    resolveExistingFailure: boolean,
  ): Promise<{ recordId: string; claimId: string } | 'already_succeeded'> {
    const claimId: string = randomUUID();
    const existing: FeishuRecord | undefined = await this.findRuntimeState(idempotencyKey);
    if (existing) {
      const status: string = readText(existing.fields['状态']);
      if (status === '成功') return 'already_succeeded';
      const updatedAt: number = Number(existing.fields['更新时间'] ?? 0);
      const stale: boolean = !Number.isFinite(updatedAt) || updatedAt <= Date.now() - 5 * 60 * 1000;
      if (status === '待执行' && !stale) {
        throw new ServiceUnavailableException('reminder reconciliation is already in progress');
      }
      if (status === '失败' && !resolveExistingFailure) {
        throw new ServiceUnavailableException('reminder reconciliation previously failed; use the explicit retry action');
      }
      const claimBucket: number = Math.floor(Date.now() / (5 * 60 * 1000));
      const retryClaimKey: string = `operation-claim:${createHash('sha256')
        .update(`${idempotencyKey}:${status}:${updatedAt}:${claimBucket}`)
        .digest('hex').slice(0, 40)}`;
      const retryClientToken: string = createHash('sha256').update(`runtime-state:${retryClaimKey}`).digest('hex').slice(0, 32);
      const retryClaim = await this.feishuRequest<RecordCreateData>({
        method: 'POST',
        url: `${OPEN_API_ROOT}/bitable/v1/apps/${this.config.reminderBaseToken}/tables/${this.config.runtimeStateTableId}/records?client_token=${retryClientToken}`,
        data: { fields: {
          '幂等键': retryClaimKey, '类型': 'operation_claim', '状态': '待执行',
          '来源ID': sourceId, '步骤': 'progress_sync', '结果引用': claimId, '错误': '', '更新时间': Date.now(),
        } },
      });
      const acquiredRetryClaim: FeishuRecord | undefined = readText(retryClaim.record.fields['结果引用']) === claimId
        ? retryClaim.record
        : await this.findRuntimeState(retryClaimKey);
      if (!acquiredRetryClaim || readText(acquiredRetryClaim.fields['结果引用']) !== claimId) {
        throw new ServiceUnavailableException('reminder reconciliation claim was acquired by another worker');
      }
      await this.updateDailyPageLedger(existing.record_id, {
        '类型': 'reminder_reconcile', '状态': '待执行', '来源ID': sourceId,
        '步骤': 'progress_sync', '结果引用': claimId, '错误': '', '更新时间': Date.now(),
      });
      return { recordId: existing.record_id, claimId };
    }
    const clientToken: string = createHash('sha256').update(`runtime-state:${idempotencyKey}`).digest('hex').slice(0, 32);
    const created = await this.feishuRequest<RecordCreateData>({
      method: 'POST',
      url: `${OPEN_API_ROOT}/bitable/v1/apps/${this.config.reminderBaseToken}/tables/${this.config.runtimeStateTableId}/records?client_token=${clientToken}`,
      data: { fields: {
        '幂等键': idempotencyKey, '类型': 'reminder_reconcile', '状态': '待执行',
        '来源ID': sourceId, '步骤': 'progress_sync', '结果引用': claimId, '错误': '', '更新时间': Date.now(),
      } },
    });
    const claimed: FeishuRecord | undefined = readText(created.record.fields['结果引用']) === claimId
      ? created.record
      : await this.findRuntimeState(idempotencyKey);
    if (!claimed || readText(claimed.fields['结果引用']) !== claimId) {
      throw new ServiceUnavailableException('reminder reconciliation claim was acquired by another worker');
    }
    return { recordId: claimed.record_id, claimId };
  }

  async reconcileReminderRecord(recordId: string, resolveExistingFailure: boolean = false): Promise<ReminderReconcileResult> {
    if (!/^rec[A-Za-z0-9]+$/u.test(recordId)) {
      throw new BadRequestException('recordId is invalid');
    }
    const reminderRecord: FeishuRecord = await this.getReminderRecord(recordId);
    const completionStatus: string = readText(reminderRecord.fields['完成状态']);
    const transitionVersion: string = readText(reminderRecord.last_modified_time);
    if (!transitionVersion) {
      throw new ServiceUnavailableException('reminder record is missing last_modified_time; refusing an unstable reconciliation key');
    }
    const transitionKey: string = createHash('sha256')
      .update(`${recordId}:${completionStatus}:${transitionVersion}`).digest('hex').slice(0, 40);
    const idempotencyKey: string = `reminder-reconcile:${transitionKey}`;
    const claim = await this.claimReminderReconcile(idempotencyKey, recordId, resolveExistingFailure);
    if (claim === 'already_succeeded') {
      return { ok: true, action: 'reconciled', recordId, completionStatus };
    }
    try {
      const result = await this.reconcileReminderRecordCore(recordId, reminderRecord);
      await this.updateDailyPageLedger(claim.recordId, {
        '状态': '成功', '结果引用': claim.claimId, '错误': '', '更新时间': Date.now(),
      });
      return result;
    } catch (error: unknown) {
      try {
        await this.updateDailyPageLedger(claim.recordId, {
          '状态': '失败', '结果引用': claim.claimId,
          '错误': errorMessage(error).slice(0, 500), '更新时间': Date.now(),
        });
      } catch (ledgerError: unknown) {
        this.logger.error(`runtime failure ledger write failed for ${recordId}: ${errorMessage(ledgerError)}`);
      }
      throw error;
    }
  }

  private async reconcileReminderRecordCore(recordId: string, reminderRecord: FeishuRecord): Promise<ReminderReconcileResult> {
    const completionStatus: string = readText(reminderRecord.fields['完成状态']);
    if (readText(reminderRecord.fields['事件状态']) !== '有效') {
      return { ok: true, action: 'reconciled', recordId, completionStatus };
    }
    const progressIds: string[] = readProgressRecordIds(reminderRecord.fields['求职记录ID']);
    let pendingRecords: FeishuRecord[] = await this.listReminderRecordsForProgressIds(progressIds);
    if (
      completionStatus === '待完成'
      && !pendingRecords.some((record: FeishuRecord): boolean => (
        record.record_id === reminderRecord.record_id
      ))
    ) {
      pendingRecords = [...pendingRecords, reminderRecord];
    }
    if (completionStatus === '已完成') {
      await this.applyReminderOutcome(reminderRecord, 'completed', pendingRecords);
    } else if (completionStatus === '已错过') {
      await this.applyReminderOutcome(reminderRecord, 'not_attended', pendingRecords);
    } else if (completionStatus === '待完成') {
      await this.syncPendingInvitations(pendingRecords);
    } else {
      throw new BadRequestException('reminder completion status is invalid');
    }
    return {
      ok: true,
      action: 'reconciled',
      recordId,
      completionStatus,
    };
  }

  verifyReminderReconcileSecret(candidate: string | undefined): void {
    const actual: Buffer = Buffer.from(String(candidate ?? ''));
    const expected: Buffer = Buffer.from(this.config.reminderReconcileSecret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('invalid reminder reconciliation secret');
    }
  }

  private async applyReminderOutcome(
    reminderRecord: FeishuRecord,
    action: 'completed' | 'not_attended',
    pendingReminderRecords: FeishuRecord[],
    progressRecordCache?: Map<string, FeishuRecord>,
  ): Promise<ReminderOutcomeResult> {
    const currentCompletionStatus: string = readText(reminderRecord.fields['完成状态']);
    const targetCompletionStatus: '已完成' | '已错过' = action === 'completed'
      ? '已完成'
      : '已错过';
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
    const progressRecordIds: string[] = readProgressRecordIds(
      reminderRecord.fields['求职记录ID'],
    );
    const alreadyUpdated: boolean = currentCompletionStatus === targetCompletionStatus;
    if (!alreadyUpdated) {
      await this.updateReminderRecord(reminderRecord.record_id, {
        '完成状态': targetCompletionStatus,
      });
    }

    if (action === 'not_attended') {
      return {
        alreadyUpdated,
        nextStep: '待反馈',
        progressRecordFound: progressRecordIds.length > 0,
        targetCompletionStatus,
      };
    }

    if (progressRecordIds.length === 0) {
      return {
        alreadyUpdated,
        nextStep: '待反馈',
        progressRecordFound: false,
        targetCompletionStatus,
      };
    }
    const pendingRecords: FeishuRecord[] = pendingReminderRecords;
    let progressRecordFound: boolean = false;
    let firstNextStep: string = '待反馈';
    for (const progressRecordId of progressRecordIds) {
      const progressRecord: FeishuRecord = await this.getCachedProgressRecord(
          progressRecordId,
          progressRecordCache,
        );
        const progressStatus: string = progressStatusFor(progressRecord.fields);
        if (MANUAL_PROGRESS_STATUSES.has(progressStatus)) {
          continue;
        }
        progressRecordFound = true;
        const currentCompletedNode: string = readText(
          progressRecord.fields['最近完成节点'],
        );
        const targetCompletedNode: string = action === 'completed'
          ? chooseLaterCompletedNode(currentCompletedNode, completedNode)
          : currentCompletedNode;
        const targetCompletedRank: number = COMPLETED_NODE_RANK[targetCompletedNode] ?? 0;
        const linkedPendingRecords: FeishuRecord[] = pendingRecords
          .filter((record: FeishuRecord): boolean => {
            if (
              record.record_id === reminderRecord.record_id
              || !readProgressRecordIds(record.fields['求职记录ID']).includes(progressRecordId)
            ) {
              return false;
            }
            const eventCompletedNode: string = EVENT_STAGE_TO_COMPLETED_NODE[
              readText(record.fields['环节'])
            ] ?? '';
            const eventCompletedRank: number = COMPLETED_NODE_RANK[eventCompletedNode] ?? 0;
            return eventCompletedRank === 0 || eventCompletedRank >= targetCompletedRank;
          })
          .sort(compareReminderProgress)
          .reverse();
        const nextStep: string = EVENT_STAGE_TO_NEXT_STEP[
          readText(linkedPendingRecords[0]?.fields['环节'])
        ] ?? '待反馈';
        if (firstNextStep === '待反馈') {
          firstNextStep = nextStep;
        }
        const targetProgressStatus: string =
          NEXT_STEP_TO_PROGRESS_STATUS[nextStep] ?? '状态待确认';
        const progressFields: Record<string, unknown> = {
          '进展状态': targetProgressStatus,
        };
        if (action === 'completed') {
          const eventProgressStatus: string = NEXT_STEP_TO_PROGRESS_STATUS[
            EVENT_STAGE_TO_NEXT_STEP[stage]
          ] ?? '';
          const completionAdvances: boolean = targetCompletedNode !== currentCompletedNode;
          const finishesCurrentStep: boolean = currentCompletedNode === completedNode
            && progressStatus === eventProgressStatus;
          if (!completionAdvances && !finishesCurrentStep) {
            continue;
          }
          progressFields['最近完成节点'] = targetCompletedNode;
        }
        const progressChanged: boolean = Object.entries(progressFields).some(
          ([fieldName, value]: [string, unknown]): boolean =>
            readText(progressRecord.fields[fieldName]) !== readText(value),
        );
        if (progressChanged) {
          await this.updateProgressRecord(progressRecordId, progressFields);
          Object.assign(progressRecord.fields, progressFields);
        }
    }
    return {
      alreadyUpdated,
      nextStep: firstNextStep,
      progressRecordFound,
      targetCompletionStatus,
    };
  }

  private async syncPendingInvitations(
    records: FeishuRecord[],
    progressRecordCache?: Map<string, FeishuRecord>,
  ): Promise<void> {
    const pendingByProgressId: Map<string, FeishuRecord[]> = new Map();
    for (const record of [...records].sort(compareReminderProgress)) {
      for (const progressRecordId of readProgressRecordIds(record.fields['求职记录ID'])) {
        const linkedRecords: FeishuRecord[] = pendingByProgressId.get(progressRecordId) ?? [];
        linkedRecords.push(record);
        pendingByProgressId.set(progressRecordId, linkedRecords);
      }
    }
    for (const [progressRecordId, linkedRecords] of pendingByProgressId) {
      const progressRecord: FeishuRecord = await this.getCachedProgressRecord(
          progressRecordId,
          progressRecordCache,
        );
        const currentStatus: string = progressStatusFor(progressRecord.fields);
        if (MANUAL_PROGRESS_STATUSES.has(currentStatus)) {
          continue;
        }
        const currentRank: number = PROGRESS_STATUS_RANK[currentStatus] ?? -1;
        const reminderRecord: FeishuRecord | undefined = [...linkedRecords]
          .reverse()
          .find((record: FeishuRecord): boolean => {
            const nextStep: string = EVENT_STAGE_TO_NEXT_STEP[
              readText(record.fields['环节'])
            ] ?? '';
            const candidateStatus: string = NEXT_STEP_TO_PROGRESS_STATUS[nextStep] ?? '';
            const candidateRank: number = PROGRESS_STATUS_RANK[candidateStatus] ?? -1;
            return candidateRank >= currentRank;
          });
        if (!reminderRecord) {
          continue;
        }
        const nextStep: string = EVENT_STAGE_TO_NEXT_STEP[
          readText(reminderRecord.fields['环节'])
        ] ?? '';
        const targetStatus: string = NEXT_STEP_TO_PROGRESS_STATUS[nextStep] ?? '';
        if (!targetStatus) {
          continue;
        }
        const progressFields: Record<string, unknown> = {
          '进展状态': targetStatus,
        };
        const progressChanged: boolean = Object.entries(progressFields).some(
          ([fieldName, value]: [string, unknown]): boolean =>
            readText(progressRecord.fields[fieldName]) !== readText(value),
        );
        if (progressChanged) {
          await this.updateProgressRecord(progressRecordId, progressFields);
          Object.assign(progressRecord.fields, progressFields);
        }
    }
  }

  private async getReminderRecord(recordId: string): Promise<FeishuRecord> {
    const data: RecordDetailData = await this.feishuRequest<RecordDetailData>({
      method: 'GET',
      url: `${OPEN_API_ROOT}/bitable/v1/apps/`
        + `${this.config.reminderBaseToken}/tables/${this.config.reminderTableId}`
        + `/records/${encodeURIComponent(recordId)}`,
    });
    return data.record;
  }

  private async getCachedProgressRecord(
    recordId: string,
    cache?: Map<string, FeishuRecord>,
  ): Promise<FeishuRecord> {
    const cached: FeishuRecord | undefined = cache?.get(recordId);
    if (cached) {
      return cached;
    }
    const record: FeishuRecord = await this.getProgressRecord(recordId);
    cache?.set(recordId, record);
    return record;
  }

  private async listReminderRecordsByStatus(
    status: '待完成' | '已完成' | '已错过',
  ): Promise<FeishuRecord[]> {
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
              value: [status],
            }],
          },
        },
      });
      records.push(...(data.items ?? []).filter(
        (record: FeishuRecord): boolean =>
          readText(record.fields['事件状态']) === '有效',
      ));
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

  private async listReminderRecordsForProgressIds(recordIds: string[]): Promise<FeishuRecord[]> {
    const records: Map<string, FeishuRecord> = new Map();
    for (const recordId of recordIds) {
      let pageToken: string = '';
      do {
        const suffix: string = pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : '';
        const data: RecordSearchData = await this.feishuRequest<RecordSearchData>({
          method: 'POST',
          url: `${OPEN_API_ROOT}/bitable/v1/apps/`
            + `${this.config.reminderBaseToken}/tables/${this.config.reminderTableId}`
            + `/records/search?page_size=100${suffix}`,
          data: {
            filter: {
              conjunction: 'and',
              conditions: [
                { field_name: '完成状态', operator: 'is', value: ['待完成'] },
                { field_name: '求职记录ID', operator: 'contains', value: [recordId] },
              ],
            },
          },
        });
        for (const item of data.items ?? []) {
          if (readText(item.fields['事件状态']) === '有效') records.set(item.record_id, item);
        }
        pageToken = data.has_more ? readText(data.page_token) : '';
        if (data.has_more && !pageToken) throw new ServiceUnavailableException('linked reminder pagination is incomplete');
      } while (pageToken);
    }
    return [...records.values()];
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

  private async deleteProgressRecord(recordId: string): Promise<void> {
    const url: string = `${OPEN_API_ROOT}/bitable/v1/apps/`
      + `${this.config.progressBaseToken}/tables/${this.config.progressTableId}`
      + `/records/${encodeURIComponent(recordId)}`;
    await this.feishuRequest<Record<string, never>>({
      method: 'DELETE',
      url,
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
            `Feishu API request failed: code=${response.data.code} ${response.data.msg ?? ''}`.trim(),
          );
        }
        return response.data.data;
      } catch (error: unknown) {
        throw new FeishuRequestError(
          `Feishu API request failed: ${errorMessage(error)}`,
          isAxiosError(error) && !error.response,
        );
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
          `Feishu token request failed: code=${response.data.code} ${response.data.msg ?? ''}`.trim(),
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
        if (!isTransientError(error)) throw error;
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
