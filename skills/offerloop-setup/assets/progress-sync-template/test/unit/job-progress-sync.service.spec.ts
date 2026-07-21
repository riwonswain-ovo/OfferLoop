import { HttpService } from '@nestjs/axios';
import axios, {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { JobProgressSyncService } from '../../server/modules/job-progress-sync/job-progress-sync.service';

const TEST_ENV: Record<string, string> = {
  FEISHU_APP_ID: 'cli_test',
  FEISHU_APP_SECRET: 'test-secret',
  SOURCE_BASE_TOKEN: 'source-base',
  SOURCE_TABLE_ID: 'source-table',
  PROGRESS_BASE_TOKEN: 'progress-base',
  PROGRESS_TABLE_ID: 'progress-table',
};

function installTestEnv(): void {
  for (const [name, value] of Object.entries(TEST_ENV)) {
    process.env[name] = value;
  }
}

interface MockService {
  service: JobProgressSyncService;
  calls: InternalAxiosRequestConfig[];
}

function createMockService(
  responder: (config: InternalAxiosRequestConfig) => unknown,
): MockService {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (
    config: InternalAxiosRequestConfig,
  ): Promise<AxiosResponse<unknown>> => {
    calls.push(config);
    return {
      data: responder(config),
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    };
  };
  const httpService: HttpService = new HttpService(axios.create({ adapter }));
  return {
    service: new JobProgressSyncService(httpService),
    calls,
  };
}

function parseRequestData(config: InternalAxiosRequestConfig): unknown {
  return typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
}

describe('JobProgressSyncService', (): void => {
  beforeEach((): void => {
    installTestEnv();
  });

  it('creates a progress record with blank user-maintained fields', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/source-base/tables/source-table/records/rec_source')) {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'rec_source',
              fields: {
                公司: '示例公司',
                投递进度: ['已投递'],
                公告链接: 'https://example.com/notice',
                投递链接: 'https://example.com/apply',
              },
            },
          },
        };
      }
      if (url.includes('/progress-base/tables/progress-table/records/search')) {
        return { code: 0, data: { items: [] } };
      }
      return {
        code: 0,
        data: { record: { record_id: 'rec_progress', fields: {} } },
      };
    });

    const result = await mock.service.sync({
      sourceRecordId: 'rec_source',
      transitionedAt: '2026-07-17T19:00:00+08:00',
    });

    expect(result).toEqual({
      ok: true,
      action: 'created',
      recordId: 'rec_progress',
    });
    const createCall: InternalAxiosRequestConfig | undefined = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').includes('client_token='),
    );
    expect(createCall).toBeDefined();
    if (!createCall) {
      throw new Error('create request was not sent');
    }
    expect(parseRequestData(createCall)).toMatchObject({
      fields: {
        当前阶段: '已投递',
        公司: '示例公司',
        投递岗位: '',
        投递日期: Date.parse('2026-07-17T00:00:00+08:00'),
        '岗位 JD': '',
        公告链接: 'https://example.com/notice',
        投递链接: 'https://example.com/apply',
        '企业清单 record_id': 'rec_source',
      },
    });
  });

  it('preserves a later interview stage and user-edited position', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/source-base/tables/source-table/records/rec_source')) {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'rec_source',
              fields: {
                公司: '新公司名',
                投递进度: '已投递',
                公告链接: 'https://new.example/notice',
                投递链接: 'https://new.example/apply',
              },
            },
          },
        };
      }
      if (url.includes('/records/search')) {
        return {
          code: 0,
          data: {
            items: [
              {
                record_id: 'rec_progress',
                fields: {
                  当前阶段: '二面',
                  公司: '旧公司名',
                  投递岗位: 'AI 产品经理',
                  投递日期: Date.parse('2026-07-10T00:00:00+08:00'),
                  '岗位 JD': '负责 AI 产品规划',
                  公告链接: 'https://old.example/notice',
                  投递链接: 'https://old.example/apply',
                  '企业清单 record_id': 'rec_source',
                },
              },
            ],
          },
        };
      }
      return {
        code: 0,
        data: { record: { record_id: 'rec_progress', fields: {} } },
      };
    });

    const result = await mock.service.sync({ sourceRecordId: 'rec_source' });

    expect(result.action).toBe('updated');
    const updateCall: InternalAxiosRequestConfig | undefined = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/rec_progress'),
    );
    expect(updateCall).toBeDefined();
    if (!updateCall) {
      throw new Error('update request was not sent');
    }
    expect(parseRequestData(updateCall)).toMatchObject({
      fields: {
        当前阶段: '二面',
        公司: '新公司名',
        投递岗位: 'AI 产品经理',
        投递日期: Date.parse('2026-07-10T00:00:00+08:00'),
        '岗位 JD': '负责 AI 产品规划',
        公告链接: 'https://new.example/notice',
        投递链接: 'https://new.example/apply',
      },
    });
  });
});
