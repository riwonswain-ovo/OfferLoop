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
  'SOURCE_BASE_URL',
  'PROGRESS_BASE_TOKEN',
  'PROGRESS_TABLE_ID',
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
}

interface RecordCreateData {
  record: FeishuRecord;
}

interface DeploymentConfig {
  appId: string;
  appSecret: string;
  sourceBaseToken: string;
  sourceTableId: string;
  sourceBaseUrl: string;
  progressBaseToken: string;
  progressTableId: string;
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
    sourceBaseUrl: String(env.SOURCE_BASE_URL),
    progressBaseToken: String(env.PROGRESS_BASE_TOKEN),
    progressTableId: String(env.PROGRESS_TABLE_ID),
  };
}

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

function urlCell(link: string): Record<string, string> {
  return {
    link,
    text: '查看原招聘信息',
  };
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

    const existing: FeishuRecord | null = await this.findProgressRecord(
      request.sourceRecordId,
    );
    const sourceRecordUrl: string = this.buildSourceRecordUrl(request.sourceRecordId);
    const submittedDate: string = formatShanghaiDate(request.transitionedAt);

    if (existing === null) {
      const fields: Record<string, unknown> = {
        '当前阶段': '已投递',
        '公司': company,
        '投递岗位': '',
        '投递日期': submittedDate,
        '岗位 JD': '',
        '原招聘信息': urlCell(sourceRecordUrl),
        '企业清单 record_id': request.sourceRecordId,
      };
      const recordId: string = await this.createProgressRecord(fields);
      return { ok: true, action: 'created', recordId };
    }

    const existingComparable: Record<string, unknown> = {
      '当前阶段': readText(existing.fields['当前阶段']) || '已投递',
      '公司': readText(existing.fields['公司']),
      '投递岗位': readText(existing.fields['投递岗位']),
      '投递日期': existing.fields['投递日期'] || submittedDate,
      '岗位 JD': readText(existing.fields['岗位 JD']),
      '原招聘信息': urlCell(readUrl(existing.fields['原招聘信息'])),
      '企业清单 record_id': readText(existing.fields['企业清单 record_id']),
    };
    const fields: Record<string, unknown> = {
      ...existingComparable,
      '公司': company,
      '原招聘信息': urlCell(sourceRecordUrl),
      '企业清单 record_id': request.sourceRecordId,
    };

    if (isDeepStrictEqual(fields, existingComparable)) {
      return { ok: true, action: 'unchanged', recordId: existing.record_id };
    }

    await this.updateProgressRecord(existing.record_id, fields);
    return { ok: true, action: 'updated', recordId: existing.record_id };
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

  private async findProgressRecord(sourceRecordId: string): Promise<FeishuRecord | null> {
    const url: string = `${OPEN_API_ROOT}/bitable/v1/apps/`
      + `${this.config.progressBaseToken}/tables/${this.config.progressTableId}`
      + '/records/search?page_size=2';
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
    const items: FeishuRecord[] = data.items ?? [];
    if (items.length > 1) {
      throw new ServiceUnavailableException(
        `duplicate progress records for source record ${sourceRecordId}`,
      );
    }
    return items[0] ?? null;
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

  private buildSourceRecordUrl(recordId: string): string {
    const separator: string = this.config.sourceBaseUrl.includes('?') ? '&' : '?';
    return `${this.config.sourceBaseUrl}${separator}record=${encodeURIComponent(recordId)}`;
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
