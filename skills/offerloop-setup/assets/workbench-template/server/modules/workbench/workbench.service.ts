import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

import type {
  BaseCellValue,
  WorkbenchDataset,
  WorkbenchRecord,
  WorkbenchResponse,
  WorkbenchTableDataset,
  WorkbenchViewDataset,
} from '@shared/api.interface';

const FEISHU_API_ROOT = 'https://open.feishu.cn/open-apis';
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;

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

interface FeishuRecordPage {
  items?: FeishuRecord[];
  total?: number;
  has_more?: boolean;
  page_token?: string;
}

interface FeishuView {
  view_id: string;
  view_name: string;
  view_type: string;
}

interface FeishuViewPage {
  items?: FeishuView[];
}

interface FeishuTable {
  table_id: string;
  name: string;
}

interface FeishuTablePage {
  items?: FeishuTable[];
}

interface DatasetConfig {
  baseToken: string;
  tableId: string;
  pageSize: number;
}

const EVENT_TABLE_ORDER: string[] = [
  '全部安排',
  '笔试',
  '群面',
  '一面',
  '二面',
  '三面',
  'HR面',
];

@Injectable()
export class WorkbenchService {
  private readonly logger = new Logger(WorkbenchService.name);
  private accessToken = '';
  private accessTokenExpiresAt = 0;

  constructor(private readonly httpService: HttpService) {}

  async getWorkbench(): Promise<WorkbenchResponse> {
    const companiesConfig: DatasetConfig = this.readDatasetConfig(
      'SOURCE',
      30,
    );
    const progressConfig: DatasetConfig = this.readDatasetConfig(
      'PROGRESS',
      30,
    );
    const eventsConfig: DatasetConfig = this.readDatasetConfig(
      'REMINDER',
      30,
    );

    const [companyViews, progressViews, eventTables, eventViews]: [
      WorkbenchViewDataset[],
      WorkbenchViewDataset[],
      WorkbenchTableDataset[],
      FeishuView[],
    ] =
      await Promise.all([
        this.readDatasetViews(companiesConfig),
        this.readDatasetViews(progressConfig),
        this.readTableDatasets(eventsConfig),
        this.readViews(eventsConfig),
      ]);

    const companies: WorkbenchDataset = companyViews[0]
      ?? await this.readDataset(companiesConfig);
    const progress: WorkbenchDataset = progressViews[0]
      ?? await this.readDataset(progressConfig);
    const events: WorkbenchDataset = eventTables.find(
      (dataset: WorkbenchTableDataset): boolean =>
        dataset.tableId === eventsConfig.tableId,
    ) ?? await this.readDataset(eventsConfig);
    const calendarView: FeishuView | undefined = eventViews.find(
      (view: FeishuView): boolean =>
        view.view_type === 'calendar' || view.view_name === '未来 7 天',
    );
    const calendarSourceUrl: string =
      `https://my.feishu.cn/base/${eventsConfig.baseToken}`
      + `?table=${eventsConfig.tableId}`
      + (calendarView ? `&view=${calendarView.view_id}` : '');

    return {
      generatedAt: new Date().toISOString(),
      calendarSourceUrl,
      companies,
      companyViews,
      progress,
      progressViews,
      events,
      eventTables,
    };
  }

  private readDatasetConfig(prefix: string, pageSize: number): DatasetConfig {
    const baseToken: string = this.requireEnv(`${prefix}_BASE_TOKEN`);
    const tableId: string = this.requireEnv(`${prefix}_TABLE_ID`);
    return { baseToken, tableId, pageSize };
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

    const appId: string = this.requireEnv('FEISHU_APP_ID');
    const appSecret: string = this.requireEnv('FEISHU_APP_SECRET');
    const response: AxiosResponse<FeishuEnvelope<never>> =
      await firstValueFrom(
        this.httpService.post<FeishuEnvelope<never>>(
          `${FEISHU_API_ROOT}/auth/v3/tenant_access_token/internal`,
          { app_id: appId, app_secret: appSecret },
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

  private async readDataset(
    config: DatasetConfig,
    viewId?: string,
  ): Promise<WorkbenchDataset> {
    const token: string = await this.getAccessToken();
    const url: string =
      `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}`
      + `/tables/${config.tableId}/records/search`
      + `?page_size=${config.pageSize}`;
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
    return {
      records,
      total: Number(payload.data.total ?? records.length),
      hasMore: Boolean(payload.data.has_more),
      pageToken: payload.data.page_token || undefined,
      sourceUrl:
        `https://my.feishu.cn/base/${config.baseToken}`
        + `?table=${config.tableId}`
        + (viewId ? `&view=${viewId}` : ''),
    };
  }

  private async readDatasetViews(
    config: DatasetConfig,
  ): Promise<WorkbenchViewDataset[]> {
    const views: FeishuView[] = await this.readViews(config);
    return Promise.all(
      views.map(
        async (view: FeishuView): Promise<WorkbenchViewDataset> => ({
          ...(await this.readDataset(config, view.view_id)),
          viewId: view.view_id,
          viewName: view.view_name,
          viewType: view.view_type,
        }),
      ),
    );
  }

  private async readViews(config: DatasetConfig): Promise<FeishuView[]> {
    const token: string = await this.getAccessToken();
    const url: string =
      `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}`
      + `/tables/${config.tableId}/views?page_size=100`;
    const response: AxiosResponse<FeishuEnvelope<FeishuViewPage>> =
      await firstValueFrom(
        this.httpService.get<FeishuEnvelope<FeishuViewPage>>(url, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    const payload: FeishuEnvelope<FeishuViewPage> = response.data;
    if (payload.code !== 0 || !payload.data) {
      this.logger.error(
        `Base 视图读取失败：${payload.code} ${payload.msg ?? ''}`.trim(),
      );
      throw new ServiceUnavailableException('Base 视图读取失败');
    }

    return payload.data.items ?? [];
  }

  private async readTableDatasets(
    config: DatasetConfig,
  ): Promise<WorkbenchTableDataset[]> {
    const token: string = await this.getAccessToken();
    const url: string =
      `${FEISHU_API_ROOT}/bitable/v1/apps/${config.baseToken}`
      + '/tables?page_size=100';
    const response: AxiosResponse<FeishuEnvelope<FeishuTablePage>> =
      await firstValueFrom(
        this.httpService.get<FeishuEnvelope<FeishuTablePage>>(url, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    const payload: FeishuEnvelope<FeishuTablePage> = response.data;
    if (payload.code !== 0 || !payload.data) {
      this.logger.error(
        `Base 数据表读取失败：${payload.code} ${payload.msg ?? ''}`.trim(),
      );
      throw new ServiceUnavailableException('Base 数据表读取失败');
    }

    const tables: FeishuTable[] = (payload.data.items ?? [])
      .filter((table: FeishuTable): boolean =>
        EVENT_TABLE_ORDER.includes(table.name),
      )
      .sort(
        (left: FeishuTable, right: FeishuTable): number =>
          EVENT_TABLE_ORDER.indexOf(left.name)
          - EVENT_TABLE_ORDER.indexOf(right.name),
      );

    return Promise.all(
      tables.map(async (table: FeishuTable): Promise<WorkbenchTableDataset> => {
        const tableConfig: DatasetConfig = {
          ...config,
          tableId: table.table_id,
        };
        const views: FeishuView[] = await this.readViews(tableConfig);
        const view: FeishuView | undefined = views.find(
          (candidate: FeishuView): boolean => candidate.view_type === 'grid',
        ) ?? views[0];
        const dataset: WorkbenchDataset = await this.readDataset(
          tableConfig,
          view?.view_id,
        );
        return {
          ...dataset,
          tableId: table.table_id,
          tableName: table.name,
          viewId: view?.view_id ?? '',
          viewName: view?.view_name ?? table.name,
          viewType: view?.view_type ?? 'grid',
        };
      }),
    );
  }
}
