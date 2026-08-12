import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

import type { WorkbenchWikiDirectoryResponse } from '@shared/api.interface';

import { WorkbenchWikiService } from '../../server/modules/workbench/workbench-wiki.service';

describe('WorkbenchWikiService', () => {
  beforeEach(() => {
    process.env.FEISHU_APP_ID = 'cli_test';
    process.env.FEISHU_APP_SECRET = 'secret';
  });

  afterEach(() => {
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
  });

  it('loads the real wiki hierarchy and creates embeddable document urls', async () => {
    const post = jest.fn(() =>
      of({
        data: {
          code: 0,
          tenant_access_token: 'tenant-token',
          expire: 7200,
        },
      }),
    );
    const get = jest.fn(
      (
        url: string,
        config: {
          params: { parent_node_token?: string };
        },
      ) => {
        if (url.endsWith('/docx/v1/documents/guide-doc/raw_content')) {
          return of({
            data: {
              code: 0,
              data: {
                content: 'OfferLoop 使用指南正文',
              },
            },
          });
        }
        if (!config.params.parent_node_token) {
          return of({
            data: {
              code: 0,
              data: {
                items: [
                  {
                    has_child: false,
                    node_token: 'guide-node',
                    obj_token: 'guide-doc',
                    obj_type: 'docx',
                    title: '00｜OfferLoop 使用指南',
                  },
                  {
                    has_child: true,
                    node_token: 'review-node',
                    obj_token: 'review-doc',
                    obj_type: 'docx',
                    title: '04｜面试复盘',
                  },
                  {
                    has_child: false,
                    node_token: 'companies-node',
                    obj_token: 'companies-base',
                    obj_type: 'bitable',
                    title: '求职企业清单',
                  },
                  {
                    has_child: false,
                    node_token: 'tracking-node',
                    obj_token: 'tracking-sheet',
                    obj_type: 'sheet',
                    title: '投递跟踪表',
                  },
                ],
                has_more: false,
              },
            },
          });
        }
        if (config.params.parent_node_token === 'review-node') {
          return of({
            data: {
              code: 0,
              data: {
                items: [
                  {
                    has_child: false,
                    node_token: 'child-node',
                    obj_token: 'child-doc',
                    obj_type: 'docx',
                    title: '字节跳动一面',
                  },
                ],
                has_more: false,
              },
            },
          });
        }
        throw new Error('Unexpected wiki parent');
      },
    );
    const service: WorkbenchWikiService = new WorkbenchWikiService({
      get,
      post,
    } as unknown as HttpService);

    const directory: WorkbenchWikiDirectoryResponse =
      await service.getDirectory();

    expect(directory.spaceName).toBe('OfferLoop 求职空间');
    expect(directory.nodes).toHaveLength(4);
    expect(directory.nodes[0].documentUrl).toBe(
      'https://my.feishu.cn/docx/guide-doc',
    );
    expect(directory.nodes[1].children[0].title).toBe('字节跳动一面');
    expect(directory.nodes[1].children[0].wikiUrl).toBe(
      'https://my.feishu.cn/wiki/child-node',
    );
    expect(directory.nodes[2]).toMatchObject({
      objectType: 'bitable',
      wikiUrl: 'https://my.feishu.cn/wiki/companies-node',
      documentUrl: 'https://my.feishu.cn/wiki/companies-node',
    });
    expect(directory.nodes[3]).toMatchObject({
      objectType: 'sheet',
      wikiUrl: 'https://my.feishu.cn/wiki/tracking-node',
      documentUrl: 'https://my.feishu.cn/sheets/tracking-sheet',
    });

    const preview = await service.getDocumentPreview('guide-node');
    expect(preview.content).toBe('OfferLoop 使用指南正文');
    expect(preview.sourceUrl).toBe('https://my.feishu.cn/wiki/guide-node');
  });

  it('reuses the cached directory until a forced refresh', async () => {
    const post = jest.fn(() =>
      of({
        data: {
          code: 0,
          tenant_access_token: 'tenant-token',
          expire: 7200,
        },
      }),
    );
    const get = jest.fn(() =>
      of({
        data: {
          code: 0,
          data: {
            items: [],
            has_more: false,
          },
        },
      }),
    );
    const service: WorkbenchWikiService = new WorkbenchWikiService({
      get,
      post,
    } as unknown as HttpService);

    await service.getDirectory();
    await service.getDirectory();
    expect(get).toHaveBeenCalledTimes(1);

    await service.getDirectory(true);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
