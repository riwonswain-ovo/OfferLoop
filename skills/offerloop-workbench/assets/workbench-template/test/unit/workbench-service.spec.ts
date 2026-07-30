import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

import type {
  WorkbenchApplicationsResponse,
  WorkbenchDataset,
  WorkbenchHomeResponse,
  WorkbenchResponse,
} from '@shared/api.interface';

import { WorkbenchService } from '../../server/modules/workbench/workbench.service';

describe('WorkbenchService', () => {
  const env: { [key: string]: string } = {
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret',
    SOURCE_BASE_TOKEN: 'source-base',
    SOURCE_TABLE_ID: 'tbl-source',
    PROGRESS_BASE_TOKEN: 'progress-base',
    PROGRESS_TABLE_ID: 'tbl-progress',
    REMINDER_BASE_TOKEN: 'reminder-base',
    REMINDER_TABLE_ID: 'tbl-events',
  };

  beforeEach(() => {
    Object.entries(env).forEach(([key, value]: [string, string]): void => {
      process.env[key] = value;
    });
  });

  afterEach(() => {
    Object.keys(env).forEach((key: string): void => {
      delete process.env[key];
    });
  });

  it('loads only the first 9-record page and fetches later pages on demand', async () => {
    const get = jest.fn((url: string) => {
      if (url.includes('/tables?page_size=')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{ table_id: 'tbl-events', name: '全部安排' }],
            },
          },
        });
      }
      if (url.includes('/views?page_size=')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                view_id: 'view-grid',
                view_name: '默认视图',
                view_type: 'grid',
              }],
            },
          },
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    const post = jest.fn((url: string) => {
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return of({
          data: {
            code: 0,
            tenant_access_token: 'tenant-token',
            expire: 7200,
          },
        });
      }
      if (url.includes('/records/search')) {
        const secondPage: boolean = url.includes('page_token=next-page');
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                record_id: secondPage ? 'record-2' : 'record-1',
                fields: { 公司: secondPage ? '第二家公司' : '第一家公司' },
              }],
              total: 65,
              has_more: !secondPage,
              page_token: secondPage ? '' : 'next-page',
            },
          },
        });
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const service: WorkbenchService = new WorkbenchService({
      get,
      post,
    } as unknown as HttpService);

    const bootstrap: WorkbenchResponse = await service.getWorkbench();

    expect(bootstrap.companies.records).toHaveLength(1);
    expect(bootstrap.companies.total).toBe(65);
    expect(bootstrap.companies.nextPageToken).toBe('next-page');
    expect(
      post.mock.calls.some(([url]: [string]) =>
        url.includes('page_token=next-page'),
      ),
    ).toBe(false);

    const secondPage: WorkbenchDataset = await service.getDataset({
      source: 'companies',
      viewId: 'view-grid',
      pageToken: 'next-page',
    });

    expect(secondPage.records[0].recordId).toBe('record-2');
    expect(secondPage.hasMore).toBe(false);
    expect(
      post.mock.calls.some(([url]: [string]) =>
        url.includes('page_token=next-page'),
      ),
    ).toBe(true);
  });

  it('pushes combined search and filters to Base while keeping a 9-row page', async () => {
    const get = jest.fn((url: string, options?: {
      params?: { filter?: string };
    }) => {
      if (url.includes('/tables?page_size=')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{ table_id: 'tbl-events', name: '全部安排' }],
            },
          },
        });
      }
      if (url.includes('/views?page_size=')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                view_id: 'view-grid',
                view_name: '默认视图',
                view_type: 'grid',
              }],
            },
          },
        });
      }
      if (url.endsWith('/records')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{ record_id: 'matched', fields: { 公司: 'M' } }],
              total: 1,
              has_more: false,
            },
          },
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    const post = jest.fn((url: string) => {
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return of({
          data: {
            code: 0,
            tenant_access_token: 'tenant-token',
            expire: 7200,
          },
        });
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const service: WorkbenchService = new WorkbenchService({
      get,
      post,
    } as unknown as HttpService);

    const result: WorkbenchDataset = await service.getDataset({
      source: 'companies',
      searchText: '产品',
      filters: { 城市: '北京' },
    });

    expect(result.records[0].recordId).toBe('matched');
    const filteredCall = get.mock.calls.find(
      ([url]: [string]): boolean => url.endsWith('/records'),
    );
    expect(filteredCall?.[1]?.params.page_size).toBe(9);
    expect(filteredCall?.[1]?.params.filter).toContain('AND(');
    expect(filteredCall?.[1]?.params.filter).toContain('contains("产品")');
    expect(filteredCall?.[1]?.params.filter).toContain('城市');
  });

  it('keeps the home critical path to two Base reads', async () => {
    const get = jest.fn((url: string) => {
      if (url.includes('/reminder-base/') && url.endsWith('/records')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                record_id: 'event-kargo',
                fields: {
                  公司: '卡尔动力',
                  环节: '一面',
                  开始时间: Date.parse('2026-08-04T06:00:00.000Z'),
                },
              }],
              total: 1,
              has_more: false,
            },
          },
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    const post = jest.fn((url: string) => {
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return of({
          data: {
            code: 0,
            tenant_access_token: 'tenant-token',
            expire: 7200,
          },
        });
      }
      if (
        url.includes('/source-base/')
        && url.includes('/records/search?page_size=9')
      ) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                record_id: 'company-1',
                fields: { 公司: '卡尔动力' },
              }],
              total: 802,
              has_more: false,
            },
          },
        });
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const service: WorkbenchService = new WorkbenchService({
      get,
      post,
    } as unknown as HttpService);

    const response: WorkbenchHomeResponse = await service.getHome();

    expect(response.opportunityCount).toBe(802);
    expect(response.stageCounts).toEqual([]);
    expect(response.upcomingEvents.records[0].recordId).toBe('event-kargo');
    expect(
      get.mock.calls.some(([url]: [string]) =>
        url.includes('/tables?page_size=') || url.includes('/views?page_size='),
      ),
    ).toBe(false);
    expect(
      post.mock.calls.some(([url]: [string]) => url.includes('page_size=1')),
    ).toBe(false);
  });

  it('loads the applications page with filtered stage totals without scanning every record', async () => {
    const stageTotals: { [key: string]: number } = {
      已投递: 28,
      笔试: 15,
      群面: 8,
      一面: 16,
      二面: 9,
      三面: 4,
      HR面: 3,
      Offer: 2,
      已结束: 8,
    };
    const get = jest.fn((url: string, options?: {
      params?: { filter?: string };
    }) => {
      if (url.includes('/tables?page_size=')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{ table_id: 'tbl-events', name: '全部安排' }],
            },
          },
        });
      }
      if (url.includes('/views?page_size=')) {
        const isProgress: boolean = url.includes('/progress-base/');
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                view_id: isProgress ? 'view-kanban' : 'view-future',
                view_name: isProgress ? '求职看板' : '未来 7 天',
                view_type: isProgress ? 'kanban' : 'calendar',
              }],
            },
          },
        });
      }
      if (url.includes('/reminder-base/') && url.endsWith('/records')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                record_id: 'event-1',
                fields: {
                  环节: '一面',
                  公司: '卡尔动力',
                  开始时间: Date.parse('2026-08-04T06:00:00.000Z'),
                },
              }],
              total: 1,
              has_more: false,
            },
          },
          config: options,
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    const post = jest.fn((url: string, body?: {
      filter?: {
        conditions?: Array<{ value?: string[] }>;
      };
    }) => {
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return of({
          data: {
            code: 0,
            tenant_access_token: 'tenant-token',
            expire: 7200,
          },
        });
      }
      const stage: string | undefined =
        body?.filter?.conditions?.[0]?.value?.[0];
      if (stage) {
        return of({
          data: {
            code: 0,
            data: {
              items: [],
              total: stageTotals[stage],
              has_more: false,
            },
          },
        });
      }
      if (url.includes('/progress-base/')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                record_id: 'progress-1',
                fields: {
                  当前阶段: '一面',
                  公司: '字节跳动',
                  投递岗位: '产品经理',
                },
              }],
              total: 93,
              has_more: true,
              page_token: 'progress-next',
            },
          },
        });
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const service: WorkbenchService = new WorkbenchService({
      get,
      post,
    } as unknown as HttpService);

    const response: WorkbenchApplicationsResponse =
      await service.getApplications();

    expect(response.progressView.viewType).toBe('kanban');
    expect(response.progress.records[0].recordId).toBe('progress-1');
    expect(response.upcomingEvents.records[0].recordId).toBe('event-1');
    expect(response.stageCounts).toEqual(
      Object.entries(stageTotals).map(([stage, count]) => ({ stage, count })),
    );
    const upcomingCall = get.mock.calls.find(
      ([url]: [string]): boolean =>
        url.includes('/reminder-base/') && url.endsWith('/records'),
    );
    expect(upcomingCall?.[1]?.params?.filter).toBe(
      'AND(TODAY()<=CurrentValue.[开始时间],'
      + 'CurrentValue.[开始时间]<TODAY()+7)',
    );
    const countCalls = post.mock.calls.filter(
      ([url, body]: [
        string,
        { filter?: unknown }?,
      ]) => url.includes('page_size=1') && Boolean(body?.filter),
    );
    expect(countCalls).toHaveLength(9);
  });

  it('keeps knowledge digest optional when its Base is not configured', async () => {
    const service: WorkbenchService = new WorkbenchService({
      get: jest.fn(),
      post: jest.fn(),
    } as unknown as HttpService);

    const response = await service.getKnowledgeDigest();

    expect(response.configured).toBe(false);
    expect(response.summaries).toEqual([]);
    expect(response.sources).toEqual([]);
  });

  it('maps knowledge summaries and source health from the optional Base', async () => {
    process.env.KNOWLEDGE_BASE_TOKEN = 'knowledge-base';
    process.env.KNOWLEDGE_DIGEST_TABLE_ID = 'tbl-digests';
    process.env.KNOWLEDGE_SOURCE_TABLE_ID = 'tbl-sources';
    const post = jest.fn((url: string) => {
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return of({
          data: {
            code: 0,
            tenant_access_token: 'tenant-token',
            expire: 7200,
          },
        });
      }
      if (url.includes('/tbl-digests/records/search')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                record_id: 'digest-1',
                fields: {
                  标题: 'AI 产品更新',
                  信息源: '官方博客',
                  来源类型: '新闻',
                  发布时间: 1784995200000,
                  一句话结论: '新能力降低了知识检索成本。',
                  核心要点: '检索更快\n引用更完整',
                  标签: ['AI', '产品'],
                  原文链接: { link: 'https://example.com/article' },
                  完整摘要: { link: 'https://example.com/digest' },
                  状态: '已完成',
                },
              }],
              total: 1,
            },
          },
        });
      }
      if (url.includes('/tbl-sources/records/search')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [{
                record_id: 'source-1',
                fields: {
                  来源名称: '官方博客',
                  来源模式: '知识库',
                  来源类型: 'RSS',
                  关注主题: 'AI、产品',
                  文章总数: 12,
                  已读数量: 3,
                  下一批: '产品策略入门',
                  计划完成日: 1787587200000,
                  阅读计划: { link: 'https://example.com/plan' },
                  启用状态: '已启用',
                  同步状态: '正常',
                },
              }],
              total: 1,
            },
          },
        });
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const service: WorkbenchService = new WorkbenchService({
      get: jest.fn(),
      post,
    } as unknown as HttpService);

    try {
      const response = await service.getKnowledgeDigest();
      expect(response.configured).toBe(true);
      expect(response.summaries[0].keyPoints).toEqual([
        '检索更快',
        '引用更完整',
      ]);
      expect(response.summaries[0].sourceUrl).toBe(
        'https://example.com/article',
      );
      expect(response.sources[0].enabled).toBe(true);
      expect(response.sources[0].mode).toBe('知识库');
      expect(response.sources[0].interests).toEqual(['AI', '产品']);
      expect(response.sources[0].totalItems).toBe(12);
      expect(response.sources[0].completedItems).toBe(3);
      expect(response.sources[0].planUrl).toBe('https://example.com/plan');
    } finally {
      delete process.env.KNOWLEDGE_BASE_TOKEN;
      delete process.env.KNOWLEDGE_DIGEST_TABLE_ID;
      delete process.env.KNOWLEDGE_SOURCE_TABLE_ID;
    }
  });
});
