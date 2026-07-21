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
  WorkbenchDataset,
  WorkbenchDatasetQuery,
  WorkbenchRecord,
  WorkbenchResponse,
  WorkbenchTableMeta,
  WorkbenchViewMeta,
} from '@shared/api.interface';

const FEISHU_API_ROOT = 'https://open.feishu.cn/open-apis';
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;
const FEISHU_PAGE_SIZE = 30;
const FEISHU_META_PAGE_SIZE = 100;
const METADATA_CACHE_MS = 5 * 60 * 1000;

const EVENT_TABLE_ORDER: string[] = [
  '全部安排',
  '笔试',
  '群面',
  '一面',
  '二面',
  '三面',
  'HR面',
];

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

  async getDataset(query: WorkbenchDatasetQuery): Promise<WorkbenchDataset> {
    const metadata: WorkbenchMetadata = await this.getMetadata();
    const resolved: { config: DatasetConfig; viewId: string } =
      this.resolveDatasetQuery(metadata, query);
    return this.readDatasetPage(
      resolved.config,
      resolved.viewId,
      query.pageToken,
    );
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

  private requireEnv(name: string): string {
    const value: string = String(process.env[name] ?? '').trim();
    if (!value) {
      throw new ServiceUnavailableException(`工作台缺少环境变量：${name}`);
    }
    return value;
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
  ): Promise<WorkbenchDataset> {
    const token: string = await this.getAccessToken();
    const query: string = pageToken
      ? `?page_size=${FEISHU_PAGE_SIZE}&page_token=${encodeURIComponent(pageToken)}`
      : `?page_size=${FEISHU_PAGE_SIZE}`;
    const url: string =
      `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}`
      + `/tables/${config.tableId}/records/search${query}`;
    const response: AxiosResponse<FeishuEnvelope<FeishuRecordPage>> =
      await firstValueFrom(
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
      pageSize: FEISHU_PAGE_SIZE,
      sourceUrl:
        `https://my.feishu.cn/base/${config.baseToken}`
        + `?table=${config.tableId}`
        + (viewId ? `&view=${viewId}` : ''),
    };
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
