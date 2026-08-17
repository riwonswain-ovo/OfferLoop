import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

import type {
  BaseCellValue,
  KnowledgeDigestResponse,
  KnowledgeDigestSource,
  KnowledgeDigestSummary,
  WorkbenchApplicationsResponse,
  WorkbenchDataset,
  WorkbenchDatasetQuery,
  WorkbenchInterviewsResponse,
  WorkbenchHomeResponse,
  WorkbenchHomeStageCountsResponse,
  WorkbenchRecord,
  WorkbenchResponse,
  WorkbenchStageCount,
  WorkbenchTableMeta,
  WorkbenchViewMeta,
} from '@shared/api.interface';

const FEISHU_API_ROOT = 'https://open.feishu.cn/open-apis';
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;
const FEISHU_PAGE_SIZE = 9;
const FEISHU_MAX_PAGE_SIZE = 100;
const FEISHU_META_PAGE_SIZE = 100;
const METADATA_CACHE_MS = 5 * 60 * 1000;
const UPCOMING_EVENT_FILTER =
  'AND(TODAY()<=CurrentValue.[开始时间],'
  + 'CurrentValue.[开始时间]<TODAY()+7)';

const EVENT_TABLE_ORDER: string[] = [
  '全部安排',
  '笔试',
  '群面',
  '一面',
  '二面',
  '三面',
  'HR面',
];

const PROGRESS_STAGE_ORDER: string[] = [
  '待反馈',
  '待笔试',
  '待面试',
  '待群面',
  '待一面',
  '待二面',
  '待三面',
  '待 HR 面',
  '待 OC',
  'Offer',
  '未通过',
  '主动放弃',
  '岗位关闭',
  '状态待确认',
];

const SEARCH_FIELDS: Record<WorkbenchDatasetQuery['source'], string[]> = {
  companies: ['公司', '招聘项目', '招聘岗位'],
  progress: ['公司', '投递岗位', '求职记录'],
  events: ['公司', '岗位', '安排名称'],
};

const FILTER_FIELDS: Record<WorkbenchDatasetQuery['source'], string[]> = {
  companies: ['招聘批次', '城市', '投递进度'],
  progress: ['公司', '投递岗位', '进展状态', '最近完成节点'],
  events: ['公司', '环节', '完成状态'],
};

interface FeishuEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuRecord {
  record_id: string;
  fields: { [key: string]: BaseCellValue };
}

interface FeishuPage {
  has_more?: boolean;
  page_token?: string;
}

interface FeishuRecordPage extends FeishuPage {
  items?: FeishuRecord[];
  total?: number;
}

interface FeishuView {
  view_id: string;
  view_name: string;
  view_type: string;
}

interface FeishuViewPage extends FeishuPage {
  items?: FeishuView[];
}

interface FeishuTable {
  table_id: string;
  name: string;
}

interface FeishuTablePage extends FeishuPage {
  items?: FeishuTable[];
}

interface DatasetConfig {
  baseToken: string;
  tableId: string;
}

interface KnowledgeDigestConfig {
  baseToken: string;
  digestTableId: string;
  sourceTableId: string;
}

interface WorkbenchMetadata {
  companiesConfig: DatasetConfig;
  companyViews: WorkbenchViewMeta[];
  progressConfig: DatasetConfig;
  progressViews: WorkbenchViewMeta[];
  eventsConfig: DatasetConfig;
  eventTables: WorkbenchTableMeta[];
}

interface MetadataCache {
  expiresAt: number;
  value: WorkbenchMetadata;
}

@Injectable()
export class WorkbenchService {
  private readonly logger = new Logger(WorkbenchService.name);
  private accessToken = '';
  private accessTokenExpiresAt = 0;
  private accessTokenPromise: Promise<string> | null = null;
  private metadataCache: MetadataCache | null = null;
  private metadataPromise: Promise<WorkbenchMetadata> | null = null;

  constructor(private readonly httpService: HttpService) {}

  async getHome(): Promise<WorkbenchHomeResponse> {
    const companiesConfig: DatasetConfig = this.readDatasetConfig('SOURCE');
    const eventsConfig: DatasetConfig = this.readDatasetConfig('REMINDER');
    const [companies, upcomingEvents]: [
      WorkbenchDataset,
      WorkbenchDataset,
    ] = await Promise.all([
      this.readDatasetPage(companiesConfig, ''),
      this.readUpcomingEventPage(eventsConfig, ''),
    ]);
    return {
      calendarSourceUrl: upcomingEvents.sourceUrl,
      generatedAt: new Date().toISOString(),
      opportunityCount: companies.total,
      stageCounts: [],
      upcomingEvents,
      dailyCheckin: this.readDailyCheckinStatus(),
    };
  }

  async getHomeStageCounts(): Promise<WorkbenchHomeStageCountsResponse> {
    const progressConfig: DatasetConfig = this.readDatasetConfig('PROGRESS');
    const eventsConfig: DatasetConfig = this.readDatasetConfig('REMINDER');
    return {
      generatedAt: new Date().toISOString(),
      stageCounts: await this.readProgressStageCounts(progressConfig, eventsConfig),
    };
  }

  async getWorkbench(): Promise<WorkbenchResponse> {
    const metadata: WorkbenchMetadata = await this.getMetadata();
    const companyView: WorkbenchViewMeta = metadata.companyViews[0];
    const progressView: WorkbenchViewMeta = metadata.progressViews[0];
    const eventTable: WorkbenchTableMeta = metadata.eventTables[0];
    const eventView: WorkbenchViewMeta = eventTable.views[0];

    const [companies, progress, events]: WorkbenchDataset[] = await Promise.all([
      this.readDatasetPage(metadata.companiesConfig, companyView.viewId),
      this.readDatasetPage(metadata.progressConfig, progressView.viewId),
      this.readDatasetPage(
        {
          ...metadata.eventsConfig,
          tableId: eventTable.tableId,
        },
        eventView.viewId,
      ),
    ]);

    const mainEventTable: WorkbenchTableMeta =
      metadata.eventTables.find(
        (table: WorkbenchTableMeta): boolean =>
          table.tableId === metadata.eventsConfig.tableId,
      ) ?? eventTable;
    const calendarView: WorkbenchViewMeta | undefined =
      mainEventTable.views.find(
        (view: WorkbenchViewMeta): boolean =>
          view.viewType === 'calendar' || view.viewName === '未来 7 天',
      );
    const calendarSourceUrl: string =
      `https://my.feishu.cn/base/${metadata.eventsConfig.baseToken}`
      + `?table=${mainEventTable.tableId}`
      + (calendarView ? `&view=${calendarView.viewId}` : '');

    return {
      generatedAt: new Date().toISOString(),
      calendarSourceUrl,
      companies,
      companyViews: metadata.companyViews,
      progress,
      progressViews: metadata.progressViews,
      events,
      eventTables: metadata.eventTables,
    };
  }

  async getApplications(): Promise<WorkbenchApplicationsResponse> {
    const metadata: WorkbenchMetadata = await this.getMetadata();
    const progressView: WorkbenchViewMeta =
      metadata.progressViews.find(
        (view: WorkbenchViewMeta): boolean => view.viewType === 'kanban',
      ) ?? metadata.progressViews[0];
    const eventTable: WorkbenchTableMeta =
      metadata.eventTables.find(
        (table: WorkbenchTableMeta): boolean => table.tableName === '全部安排',
      ) ?? metadata.eventTables[0];
    const upcomingView: WorkbenchViewMeta =
      eventTable.views.find(
        (view: WorkbenchViewMeta): boolean =>
          view.viewName === '未来 7 天' || view.viewType === 'calendar',
      ) ?? eventTable.views[0];
    const [progress, upcomingEvents, stageCounts]: [
      WorkbenchDataset,
      WorkbenchDataset,
      WorkbenchStageCount[],
    ] = await Promise.all([
      this.readDatasetPage(metadata.progressConfig, progressView.viewId),
      this.readUpcomingEventPage(
        { ...metadata.eventsConfig, tableId: eventTable.tableId },
        upcomingView.viewId,
      ),
      this.readProgressStageCounts(metadata.progressConfig, metadata.eventsConfig),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      calendarSourceUrl:
        `https://my.feishu.cn/base/${metadata.eventsConfig.baseToken}`
        + `?table=${eventTable.tableId}&view=${upcomingView.viewId}`,
      progress,
      progressView,
      stageCounts,
      upcomingEvents,
    };
  }

  async getKnowledgeDigest(): Promise<KnowledgeDigestResponse> {
    const generatedAt: string = new Date().toISOString();
    const config: KnowledgeDigestConfig | null =
      this.readKnowledgeDigestConfig();
    if (!config) {
      return {
        configured: false,
        generatedAt,
        summaries: [],
        sources: [],
        message: '知识速览尚未配置。登记知识库或新闻来源后即可查看进度与摘要。',
      };
    }

    const [digestDataset, sourceDataset]: WorkbenchDataset[] =
      await Promise.all([
        this.readDatasetPage(
          { baseToken: config.baseToken, tableId: config.digestTableId },
          '',
        ),
        this.readDatasetPage(
          { baseToken: config.baseToken, tableId: config.sourceTableId },
          '',
        ),
      ]);
    const summaries: KnowledgeDigestSummary[] = digestDataset.records
      .map((record: WorkbenchRecord): KnowledgeDigestSummary =>
        this.toKnowledgeDigestSummary(record),
      )
      .filter((summary: KnowledgeDigestSummary): boolean =>
        Boolean(summary.title || summary.conclusion),
      )
      .sort(
        (left: KnowledgeDigestSummary, right: KnowledgeDigestSummary): number =>
          this.dateSortValue(right.publishedAt)
          - this.dateSortValue(left.publishedAt),
      )
      .slice(0, 12);
    const sources: KnowledgeDigestSource[] = sourceDataset.records
      .map((record: WorkbenchRecord): KnowledgeDigestSource =>
        this.toKnowledgeDigestSource(record),
      )
      .filter((source: KnowledgeDigestSource): boolean => Boolean(source.name));

    return {
      configured: true,
      generatedAt,
      summaries,
      sources,
      baseUrl: `https://my.feishu.cn/base/${config.baseToken}`,
      message: summaries.length === 0
        ? '信息源已经配置，等待第一次知识盘点或新闻增量同步。'
        : undefined,
    };
  }

  async getDataset(query: WorkbenchDatasetQuery): Promise<WorkbenchDataset> {
    const requestedPageSize: number = Number(query.pageSize);
    const pageSize: number = Number.isInteger(requestedPageSize)
      && requestedPageSize > 0
      && requestedPageSize <= FEISHU_MAX_PAGE_SIZE
      ? requestedPageSize
      : FEISHU_PAGE_SIZE;
    const metadata: WorkbenchMetadata = await this.getMetadata();
    const resolved: { config: DatasetConfig; viewId: string } =
      this.resolveDatasetQuery(metadata, query);
    return this.readDatasetPage(
      resolved.config,
      resolved.viewId,
      query.pageToken,
      this.buildDatasetFilter(query),
      pageSize,
    );
  }

  async getInterviews(): Promise<WorkbenchInterviewsResponse> {
    const metadata: WorkbenchMetadata = await this.getMetadata();
    const eventTable: WorkbenchTableMeta = metadata.eventTables[0];
    const eventView: WorkbenchViewMeta = eventTable.views[0];
    const [events, offerCount]: [WorkbenchDataset, number] = await Promise.all([
      this.readDatasetPage(
        { ...metadata.eventsConfig, tableId: eventTable.tableId },
        eventView.viewId,
      ),
      this.countRecordsByField(
        metadata.progressConfig,
        '进展状态',
        'Offer',
      ),
    ]);
    return {
      eventTable,
      eventView,
      events,
      generatedAt: new Date().toISOString(),
      offerCount,
    };
  }

  private buildDatasetFilter(query: WorkbenchDatasetQuery): string {
    const parts: string[] = [];
    const searchText: string = String(query.searchText ?? '').trim();
    if (searchText) {
      const safeSearch: string = this.escapeFilterValue(searchText.slice(0, 80));
      parts.push(
        `OR(${SEARCH_FIELDS[query.source].map(
          (fieldName: string): string =>
            `CurrentValue.[${fieldName}].contains("${safeSearch}")`,
        ).join(',')})`,
      );
    }
    const allowedFields: Set<string> = new Set(FILTER_FIELDS[query.source]);
    Object.entries(query.filters ?? {}).forEach(
      ([fieldName, value]: [string, string]): void => {
        if (!allowedFields.has(fieldName) || !value.trim()) {
          return;
        }
        parts.push(
          `CurrentValue.[${fieldName}]="`
          + `${this.escapeFilterValue(value.trim().slice(0, 120))}"`,
        );
      },
    );
    if (parts.length === 0) {
      return '';
    }
    return parts.length === 1 ? parts[0] : `AND(${parts.join(',')})`;
  }

  private escapeFilterValue(value: string): string {
    return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
  }

  private resolveDatasetQuery(
    metadata: WorkbenchMetadata,
    query: WorkbenchDatasetQuery,
  ): { config: DatasetConfig; viewId: string } {
    if (query.source === 'companies') {
      const viewId: string = this.resolveViewId(
        metadata.companyViews,
        query.viewId,
      );
      return { config: metadata.companiesConfig, viewId };
    }
    if (query.source === 'progress') {
      const viewId: string = this.resolveViewId(
        metadata.progressViews,
        query.viewId,
      );
      return { config: metadata.progressConfig, viewId };
    }

    const table: WorkbenchTableMeta | undefined = metadata.eventTables.find(
      (candidate: WorkbenchTableMeta): boolean =>
        candidate.tableId === (query.tableId || metadata.eventTables[0].tableId),
    );
    if (!table) {
      throw new BadRequestException('未知的笔面试数据表');
    }
    const viewId: string = this.resolveViewId(table.views, query.viewId);
    return {
      config: {
        ...metadata.eventsConfig,
        tableId: table.tableId,
      },
      viewId,
    };
  }

  private resolveViewId(
    views: WorkbenchViewMeta[],
    requestedViewId?: string,
  ): string {
    const selected: WorkbenchViewMeta | undefined = requestedViewId
      ? views.find(
        (view: WorkbenchViewMeta): boolean => view.viewId === requestedViewId,
      )
      : views[0];
    if (!selected) {
      throw new BadRequestException('未知的 Base 视图');
    }
    return selected.viewId;
  }

  private async getMetadata(): Promise<WorkbenchMetadata> {
    if (this.metadataCache && Date.now() < this.metadataCache.expiresAt) {
      return this.metadataCache.value;
    }
    if (this.metadataPromise) {
      return this.metadataPromise;
    }
    this.metadataPromise = this.loadMetadata();
    try {
      const value: WorkbenchMetadata = await this.metadataPromise;
      this.metadataCache = {
        expiresAt: Date.now() + METADATA_CACHE_MS,
        value,
      };
      return value;
    } finally {
      this.metadataPromise = null;
    }
  }

  private async loadMetadata(): Promise<WorkbenchMetadata> {
    const companiesConfig: DatasetConfig = this.readDatasetConfig('SOURCE');
    const progressConfig: DatasetConfig = this.readDatasetConfig('PROGRESS');
    const eventsConfig: DatasetConfig = this.readDatasetConfig('REMINDER');
    const [companyViews, progressViews, eventTables]: [
      WorkbenchViewMeta[],
      WorkbenchViewMeta[],
      WorkbenchTableMeta[],
    ] = await Promise.all([
      this.readViewMetadata(companiesConfig),
      this.readViewMetadata(progressConfig),
      this.readEventTableMetadata(eventsConfig),
    ]);
    return {
      companiesConfig,
      companyViews,
      progressConfig,
      progressViews,
      eventsConfig,
      eventTables,
    };
  }

  private readDatasetConfig(prefix: string): DatasetConfig {
    return {
      baseToken: this.requireEnv(`${prefix}_BASE_TOKEN`),
      tableId: this.requireEnv(`${prefix}_TABLE_ID`),
    };
  }

  private readKnowledgeDigestConfig(): KnowledgeDigestConfig | null {
    const baseToken: string = String(
      process.env.KNOWLEDGE_BASE_TOKEN ?? '',
    ).trim();
    const digestTableId: string = String(
      process.env.KNOWLEDGE_DIGEST_TABLE_ID ?? '',
    ).trim();
    const sourceTableId: string = String(
      process.env.KNOWLEDGE_SOURCE_TABLE_ID ?? '',
    ).trim();
    return baseToken && digestTableId && sourceTableId
      ? { baseToken, digestTableId, sourceTableId }
      : null;
  }

  private toKnowledgeDigestSummary(
    record: WorkbenchRecord,
  ): KnowledgeDigestSummary {
    const fields = record.fields;
    return {
      recordId: record.recordId,
      title: this.cellText(fields['标题']),
      sourceName: this.cellText(fields['信息源']),
      sourceType: this.cellText(fields['来源类型']) || '知识文章',
      publishedAt: this.cellDate(fields['发布时间']),
      conclusion: this.cellText(fields['一句话结论']),
      keyPoints: this.cellLines(fields['核心要点']).slice(0, 4),
      value: this.cellText(fields['价值说明']),
      boundary: this.cellText(fields['边界']),
      tags: this.cellList(fields['标签']),
      sourceUrl: this.cellUrl(fields['原文链接']),
      documentUrl: this.cellUrl(fields['完整摘要']),
      status: this.cellText(fields['状态']) || '已完成',
    };
  }

  private toKnowledgeDigestSource(
    record: WorkbenchRecord,
  ): KnowledgeDigestSource {
    const fields = record.fields;
    const enabledText: string = this.cellText(fields['启用状态']);
    const sourceType: string = this.cellText(fields['来源类型']);
    const sourceMode: string = this.cellText(fields['来源模式'])
      || (
        ['飞书知识库', '登录态浏览器'].includes(sourceType)
          ? '知识库'
          : '新闻站点'
      );
    return {
      recordId: record.recordId,
      name: this.cellText(fields['来源名称']),
      mode: sourceMode,
      type: sourceType,
      interests: this.cellList(fields['关注主题']),
      enabled: !['已暂停', '停用', 'false', '否'].includes(enabledText),
      lastSyncedAt: this.cellDate(fields['上次成功时间']),
      status: this.cellText(fields['同步状态']) || '待同步',
      message: this.cellText(fields['状态说明']),
      totalItems: this.cellNumber(fields['文章总数']),
      completedItems: this.cellNumber(fields['已读数量']),
      nextBatch: this.cellText(fields['下一批']),
      targetDate: this.cellDate(fields['计划完成日']),
      planUrl: this.cellUrl(fields['阅读计划']),
    };
  }

  private cellText(value: BaseCellValue | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string' || typeof value === 'number'
      || typeof value === 'boolean') {
      return String(value).trim();
    }
    if (Array.isArray(value)) {
      return value
        .map((item: BaseCellValue): string => this.cellText(item))
        .filter(Boolean)
        .join('、');
    }
    for (const key of ['text', 'name', 'label', 'value']) {
      const candidate: BaseCellValue | undefined = value[key];
      const text: string = this.cellText(candidate);
      if (text) {
        return text;
      }
    }
    return '';
  }

  private cellUrl(value: BaseCellValue | undefined): string | undefined {
    if (typeof value === 'string') {
      return /^https?:\/\//u.test(value.trim()) ? value.trim() : undefined;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const url: string | undefined = this.cellUrl(item);
        if (url) {
          return url;
        }
      }
      return undefined;
    }
    if (value && typeof value === 'object') {
      for (const key of ['link', 'url', 'href']) {
        const candidate: BaseCellValue | undefined = value[key];
        const url: string | undefined = this.cellUrl(candidate);
        if (url) {
          return url;
        }
      }
    }
    return undefined;
  }

  private cellDate(value: BaseCellValue | undefined): string | undefined {
    const raw: string = this.cellText(value);
    if (!raw) {
      return undefined;
    }
    const numeric: number = Number(raw);
    const date = new Date(Number.isFinite(numeric) && numeric > 0
      ? numeric
      : raw);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private cellNumber(value: BaseCellValue | undefined): number {
    const numeric: number = Number(this.cellText(value));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
  }

  private cellList(value: BaseCellValue | undefined): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item: BaseCellValue): string => this.cellText(item))
        .filter(Boolean);
    }
    return this.cellText(value)
      .split(/[，,、]/u)
      .map((item: string): string => item.trim())
      .filter(Boolean);
  }

  private cellLines(value: BaseCellValue | undefined): string[] {
    return this.cellText(value)
      .split(/\r?\n|；/u)
      .map((item: string): string =>
        item.replace(/^\s*[-*•\d.、)]+\s*/u, '').trim(),
      )
      .filter(Boolean);
  }

  private dateSortValue(value?: string): number {
    const timestamp: number = value ? Date.parse(value) : 0;
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private requireEnv(name: string): string {
    const value: string = String(process.env[name] ?? '').trim();
    if (!value) {
      throw new ServiceUnavailableException(`工作台缺少环境变量：${name}`);
    }
    return value;
  }

  private readDailyCheckinStatus(): WorkbenchHomeResponse['dailyCheckin'] {
    const rawStatus: string = String(
      process.env.DAILY_CHECKIN_STATUS ?? 'unverified',
    ).trim();
    const allowed = new Set(['enabled', 'paused', 'disabled', 'unverified']);
    const status: WorkbenchHomeResponse['dailyCheckin']['status'] =
      allowed.has(rawStatus)
        ? rawStatus as WorkbenchHomeResponse['dailyCheckin']['status']
        : 'unverified';
    const pauseReason: string = String(
      process.env.DAILY_CHECKIN_PAUSE_REASON ?? '',
    ).trim();
    return {
      status,
      sendTime: '21:30',
      timezone: 'Asia/Shanghai',
      ...(pauseReason ? { pauseReason } : {}),
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }
    if (this.accessTokenPromise) {
      return this.accessTokenPromise;
    }
    this.accessTokenPromise = this.requestAccessToken();
    try {
      return await this.accessTokenPromise;
    } finally {
      this.accessTokenPromise = null;
    }
  }

  private async requestAccessToken(): Promise<string> {
    const response: AxiosResponse<FeishuEnvelope<never>> =
      await firstValueFrom(
        this.httpService.post<FeishuEnvelope<never>>(
          `${FEISHU_API_ROOT}/auth/v3/tenant_access_token/internal`,
          {
            app_id: this.requireEnv('FEISHU_APP_ID'),
            app_secret: this.requireEnv('FEISHU_APP_SECRET'),
          },
          { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        ),
      );
    const payload: FeishuEnvelope<never> = response.data;
    if (payload.code !== 0 || !payload.tenant_access_token) {
      this.logger.error(
        `飞书访问令牌获取失败：${payload.code} ${payload.msg ?? ''}`.trim(),
      );
      throw new ServiceUnavailableException('飞书数据授权暂不可用');
    }
    const lifetimeMs: number = Number(payload.expire ?? 7200) * 1000;
    this.accessToken = payload.tenant_access_token;
    this.accessTokenExpiresAt =
      Date.now() + Math.max(lifetimeMs - TOKEN_SAFETY_WINDOW_MS, 60_000);
    return this.accessToken;
  }

  private async readDatasetPage(
    config: DatasetConfig,
    viewId: string,
    pageToken = '',
    filter = '',
    pageSize = FEISHU_PAGE_SIZE,
  ): Promise<WorkbenchDataset> {
    const token: string = await this.getAccessToken();
    const commonParams: Record<string, string | number> = {
      page_size: pageSize,
      ...(pageToken ? { page_token: pageToken } : {}),
    };
    let response: AxiosResponse<FeishuEnvelope<FeishuRecordPage>>;
    if (filter) {
      const url: string =
        `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}`
        + `/tables/${config.tableId}/records`;
      response = await firstValueFrom(
        this.httpService.get<FeishuEnvelope<FeishuRecordPage>>(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { ...commonParams, filter },
        }),
      );
    } else {
      const query: string = pageToken
        ? `?page_size=${pageSize}`
          + `&page_token=${encodeURIComponent(pageToken)}`
        : `?page_size=${pageSize}`;
      const url: string =
        `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}`
        + `/tables/${config.tableId}/records/search${query}`;
      response = await firstValueFrom(
        this.httpService.post<FeishuEnvelope<FeishuRecordPage>>(
          url,
          viewId ? { view_id: viewId } : {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
          },
        ),
      );
    }
    const payload: FeishuEnvelope<FeishuRecordPage> = response.data;
    if (payload.code !== 0 || !payload.data) {
      this.logger.error(
        `Base 读取失败：${payload.code} ${payload.msg ?? ''}`.trim(),
      );
      throw new ServiceUnavailableException('Base 数据读取失败');
    }
    const records: WorkbenchRecord[] = (payload.data.items ?? []).map(
      (item: FeishuRecord): WorkbenchRecord => ({
        recordId: item.record_id,
        fields: item.fields,
      }),
    );
    const nextPageToken: string = payload.data.has_more
      ? String(payload.data.page_token ?? '')
      : '';
    return {
      records,
      total: Number(payload.data.total ?? records.length),
      hasMore: Boolean(nextPageToken),
      nextPageToken: nextPageToken || undefined,
      pageSize,
      sourceUrl:
        `https://my.feishu.cn/base/${config.baseToken}`
        + `?table=${config.tableId}`
        + (viewId ? `&view=${viewId}` : ''),
    };
  }

  private async readUpcomingEventPage(
    config: DatasetConfig,
    viewId: string,
  ): Promise<WorkbenchDataset> {
    const dataset: WorkbenchDataset = await this.readDatasetPage(
      config,
      viewId,
      '',
      UPCOMING_EVENT_FILTER,
    );
    return {
      ...dataset,
      records: [...dataset.records].sort(
        (left: WorkbenchRecord, right: WorkbenchRecord): number =>
          this.dateSortValue(this.cellDate(left.fields['开始时间']))
          - this.dateSortValue(this.cellDate(right.fields['开始时间'])),
      ),
    };
  }

  private async readProgressStageCounts(
    progressConfig: DatasetConfig,
    _eventsConfig: DatasetConfig,
  ): Promise<WorkbenchStageCount[]> {
    const counts: number[] = await Promise.all(
      PROGRESS_STAGE_ORDER.map((stage: string): Promise<number> =>
        this.countRecordsByField(progressConfig, '进展状态', stage)),
    );
    return PROGRESS_STAGE_ORDER.map(
      (stage: string, index: number): WorkbenchStageCount => ({
        stage,
        count: counts[index],
      }),
    );
  }

  private async countRecordsByField(
    config: DatasetConfig,
    fieldName: string,
    value: string,
  ): Promise<number> {
    return this.countRecordsByConditions(config, [{ fieldName, value }]);
  }

  private async countRecordsByConditions(
    config: DatasetConfig,
    conditions: Array<{ fieldName: string; value: string }>,
  ): Promise<number> {
    const token: string = await this.getAccessToken();
    const url: string =
      `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}`
      + `/tables/${config.tableId}/records/search?page_size=1`;
    const response: AxiosResponse<FeishuEnvelope<FeishuRecordPage>> =
      await firstValueFrom(
        this.httpService.post<FeishuEnvelope<FeishuRecordPage>>(
          url,
          {
            filter: {
              conjunction: 'and',
              conditions: conditions.map((condition) => ({
                field_name: condition.fieldName,
                operator: 'is',
                value: [condition.value],
              })),
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
          },
        ),
      );
    const payload: FeishuEnvelope<FeishuRecordPage> = response.data;
    if (payload.code !== 0 || !payload.data) {
      this.logger.error(
        `Base 阶段计数失败：${payload.code} ${payload.msg ?? ''}`.trim(),
      );
      throw new ServiceUnavailableException('Base 阶段统计读取失败');
    }
    return Number(payload.data.total ?? 0);
  }

  private async readEventTableMetadata(
    config: DatasetConfig,
  ): Promise<WorkbenchTableMeta[]> {
    const allTables: FeishuTable[] = await this.readTables(config);
    const tables: FeishuTable[] = allTables
      .filter((table: FeishuTable): boolean =>
        EVENT_TABLE_ORDER.includes(table.name),
      )
      .sort(
        (left: FeishuTable, right: FeishuTable): number =>
          EVENT_TABLE_ORDER.indexOf(left.name)
          - EVENT_TABLE_ORDER.indexOf(right.name),
      );
    if (tables.length === 0) {
      throw new ServiceUnavailableException('未找到笔面试 Base 数据表');
    }
    return Promise.all(
      tables.map(async (table: FeishuTable): Promise<WorkbenchTableMeta> => ({
        tableId: table.table_id,
        tableName: table.name,
        views: await this.readViewMetadata({
          ...config,
          tableId: table.table_id,
        }),
      })),
    );
  }

  private async readViewMetadata(
    config: DatasetConfig,
  ): Promise<WorkbenchViewMeta[]> {
    const views: FeishuView[] = await this.readViews(config);
    if (views.length === 0) {
      return [{ viewId: '', viewName: '全部数据', viewType: 'grid' }];
    }
    return views.map((view: FeishuView): WorkbenchViewMeta => ({
      viewId: view.view_id,
      viewName: view.view_name,
      viewType: view.view_type,
    }));
  }

  private async readViews(config: DatasetConfig): Promise<FeishuView[]> {
    return this.readMetadataPages<FeishuView, FeishuViewPage>(
      `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}`
      + `/tables/${config.tableId}/views`,
      'Base 视图读取失败',
    );
  }

  private async readTables(config: DatasetConfig): Promise<FeishuTable[]> {
    return this.readMetadataPages<FeishuTable, FeishuTablePage>(
      `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}/tables`,
      'Base 数据表读取失败',
    );
  }

  private async readMetadataPages<T, TPage extends FeishuPage & { items?: T[] }>(
    baseUrl: string,
    errorMessage: string,
  ): Promise<T[]> {
    const token: string = await this.getAccessToken();
    const items: T[] = [];
    let pageToken = '';
    do {
      const query: string = pageToken
        ? `?page_size=${FEISHU_META_PAGE_SIZE}&page_token=${encodeURIComponent(pageToken)}`
        : `?page_size=${FEISHU_META_PAGE_SIZE}`;
      const response: AxiosResponse<FeishuEnvelope<TPage>> =
        await firstValueFrom(
          this.httpService.get<FeishuEnvelope<TPage>>(`${baseUrl}${query}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
      const payload: FeishuEnvelope<TPage> = response.data;
      if (payload.code !== 0 || !payload.data) {
        this.logger.error(
          `${errorMessage}：${payload.code} ${payload.msg ?? ''}`.trim(),
        );
        throw new ServiceUnavailableException(errorMessage);
      }
      items.push(...(payload.data.items ?? []));
      pageToken = payload.data.has_more
        ? String(payload.data.page_token ?? '')
        : '';
    } while (pageToken);
    return items;
  }
}
