import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

import type {
  WorkbenchDataset,
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

  it('loads only the first 30-record page and fetches later pages on demand', async () => {
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
