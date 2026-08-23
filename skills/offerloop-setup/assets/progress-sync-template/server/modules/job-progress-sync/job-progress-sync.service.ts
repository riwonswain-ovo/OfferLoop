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
import { createHash, timingSafeEqual } from 'crypto';
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
  'REMINDER_RECONCILE_SECRET',
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

interface RecordBatchGetData {
  records?: FeishuRecord[];
  forbidden_record_ids?: string[];
  absent_record_ids?: string[];
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
}

interface ReminderOutcomeResult {
  alreadyUpdated: boolean;
  nextStep: string;
  progressRecordFound: boolean;
  targetCompletionStatus: string;
}

export interface TaskReconcileResult {
  scanned: number;
  provisioned: number;
  completed: number;
  missed: number;
  postponed: number;
  skipped: number;
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
  };
}

const EVENT_STAGE_TO_COMPLETED_NODE: Record<string, string> = {
  '笔试': '笔试完成',
  '群面': '群面完成',
  '一面': '一面完成',
  '二面': '二面完成',
  '三面': '三面完成',
  'HR面': 'HR面完成',
  '面试': '面试完成',
  '面试（轮次待确认）': '面试完成',
};

const EVENT_STAGE_TO_NEXT_STEP: Record<string, string> = {
  '笔试': '笔试',
  '群面': '群面',
  '一面': '一面',
  '二面': '二面',
  '三面': '三面',
  'HR面': 'HR面',
  '面试': '面试',
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

const MANUAL_PROGRESS_STATUSES: Set<string> = new Set([
  'Offer', '未通过', '主动放弃', '岗位关闭',
]);

const PROGRESS_STATUS_RANK: Record<string, number> = {
  '待反馈': 0,
  '待笔试': 1,
  '待面试': 1,
  '待群面': 2,
  '待一面': 3,
  '待二面': 4,
  '待三面': 5,
  '待 HR 面': 6,
  '待 OC': 7,
};

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

  async reconcileTaskStates(): Promise<TaskReconcileResult> {
    const result: TaskReconcileResult = {
      scanned: 0,
      provisioned: 0,
      completed: 0,
      missed: 0,
      postponed: 0,
      skipped: 0,
    };
    const fetchedRecords: FeishuRecord[] = await this.listReminderRecords();
    result.scanned = fetchedRecords.length;
    const records: FeishuRecord[] = fetchedRecords.filter(
      (record: FeishuRecord): boolean => readText(record.fields['完成状态']) === '待完成',
    );
    const completedRecords: FeishuRecord[] = fetchedRecords.filter(
      (record: FeishuRecord): boolean => readText(record.fields['完成状态']) === '已完成',
    );
    const missedRecords: FeishuRecord[] = fetchedRecords.filter(
      (record: FeishuRecord): boolean => readText(record.fields['完成状态']) === '已错过',
    );
    const progressRecordCache: Map<string, FeishuRecord> =
      await this.preloadProgressRecords(fetchedRecords);
    await this.syncPendingInvitations(records, progressRecordCache);
    for (const record of completedRecords) {
      try {
        await this.applyReminderOutcome(
          record,
          'completed',
          records,
          progressRecordCache,
        );
        result.completed += 1;
      } catch (error: unknown) {
        result.skipped += 1;
        this.logger.warn(
          `skipped completed reminder reconciliation for ${record.record_id}: ${errorMessage(error)}`,
        );
      }
    }
    for (const record of missedRecords) {
      try {
        await this.applyReminderOutcome(
          record,
          'not_attended',
          records,
          progressRecordCache,
        );
        result.missed += 1;
      } catch (error: unknown) {
        result.skipped += 1;
        this.logger.warn(
          `skipped missed reminder reconciliation for ${record.record_id}: ${errorMessage(error)}`,
        );
      }
    }
    return result;
  }

  async reconcileReminderRecord(recordId: string): Promise<ReminderReconcileResult> {
    if (!/^rec[A-Za-z0-9]+$/u.test(recordId)) {
      throw new BadRequestException('recordId is invalid');
    }
    const reminderRecord: FeishuRecord = await this.getReminderRecord(recordId);
    const completionStatus: string = readText(reminderRecord.fields['完成状态']);
    let pendingRecords: FeishuRecord[] = await this.listReminderRecordsByStatus('待完成');
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

  async resolveReminderRecordId(
    sourceEmailId: string,
    recordTitle: string,
  ): Promise<string> {
    const locators: Array<{ fieldName: string; value: string }> = [
      { fieldName: '来源邮件ID', value: readText(sourceEmailId) },
      { fieldName: '安排名称', value: readText(recordTitle) },
    ].filter(({ value }: { value: string }): boolean => Boolean(value));

    for (const locator of locators) {
      const data: RecordSearchData = await this.feishuRequest<RecordSearchData>({
        method: 'POST',
        url: `${OPEN_API_ROOT}/bitable/v1/apps/`
          + `${this.config.reminderBaseToken}/tables/${this.config.reminderTableId}`
          + '/records/search?page_size=2',
        data: {
          filter: {
            conjunction: 'and',
            conditions: [{
              field_name: locator.fieldName,
              operator: 'is',
              value: [locator.value],
            }],
          },
        },
      });
      const matches: FeishuRecord[] = data.items ?? [];
      if (matches.length === 1) {
        return matches[0].record_id;
      }
      if (matches.length > 1) {
        throw new BadRequestException(`${locator.fieldName} matches multiple reminder records`);
      }
    }
    return '';
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
    pendingReminderRecords?: FeishuRecord[],
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

    if (progressRecordIds.length === 0) {
      return {
        alreadyUpdated,
        nextStep: '待反馈',
        progressRecordFound: false,
        targetCompletionStatus,
      };
    }
    const pendingRecords: FeishuRecord[] = pendingReminderRecords
      ?? await this.listReminderRecordsByStatus('待完成');
    let progressRecordFound: boolean = false;
    let firstNextStep: string = '待反馈';
    for (const progressRecordId of progressRecordIds) {
      try {
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
        const noLaterPendingEvent: boolean = linkedPendingRecords.length === 0;
        const targetProgressStatus: string = (
          action === 'not_attended' && noLaterPendingEvent
        )
          ? '状态待确认'
          : NEXT_STEP_TO_PROGRESS_STATUS[nextStep] ?? '状态待确认';
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
      } catch (error: unknown) {
        this.logger.warn(
          `skipped reminder outcome progress sync for ${progressRecordId}: ${errorMessage(error)}`,
        );
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
      try {
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
      } catch (error: unknown) {
        this.logger.warn(
          `skipped invitation progress sync for ${progressRecordId}: ${errorMessage(error)}`,
        );
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

  private async listReminderRecords(): Promise<FeishuRecord[]> {
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
        data: {},
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

  private async preloadProgressRecords(
    reminderRecords: FeishuRecord[],
  ): Promise<Map<string, FeishuRecord>> {
    const progressRecordIds: string[] = [...new Set(
      reminderRecords.flatMap((record: FeishuRecord): string[] => (
        readProgressRecordIds(record.fields['求职记录ID'])
      )),
    )];
    const cache: Map<string, FeishuRecord> = new Map();
    for (let index: number = 0; index < progressRecordIds.length; index += 100) {
      const batch: string[] = progressRecordIds.slice(index, index + 100);
      const data: RecordBatchGetData = await this.feishuRequest<RecordBatchGetData>({
        method: 'POST',
        url: `${OPEN_API_ROOT}/bitable/v1/apps/`
          + `${this.config.progressBaseToken}/tables/${this.config.progressTableId}`
          + '/records/batch_get',
        data: { record_ids: batch },
      });
      for (const record of data.records ?? []) {
        if (record) {
          cache.set(record.record_id, record);
        }
      }
      const unavailableIds: string[] = [
        ...(data.forbidden_record_ids ?? []),
        ...(data.absent_record_ids ?? []),
      ];
      if (unavailableIds.length > 0) {
        this.logger.warn(
          `progress batch preload skipped ${unavailableIds.length} unavailable records`,
        );
      }
    }
    return cache;
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
