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
});
