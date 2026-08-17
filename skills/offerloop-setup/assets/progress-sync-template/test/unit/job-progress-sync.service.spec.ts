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
  REMINDER_BASE_TOKEN: 'reminder-base',
  REMINDER_TABLE_ID: 'reminder-table',
  REMINDER_BASE_URL: 'https://example.com/reminders',
  DAILY_CHECKIN_CHAT_ID: 'oc_daily',
  DAILY_CHECKIN_OWNER_OPEN_ID: 'ou_owner',
  DAILY_CHECKIN_STATUS: 'enabled',
  FEISHU_VERIFICATION_TOKEN: 'verification-token',
  REMINDER_RECONCILE_SECRET: 'workflow-secret',
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
    let responseData: unknown;
    const url: string = String(config.url ?? '');
    if (url.endsWith('/progress-table/records/batch_get')) {
      const requestData = parseRequestData(config) as { record_ids?: string[] };
      const records = (requestData.record_ids ?? []).map((recordId: string): unknown => {
        const detailResponse = responder({
          ...config,
          method: 'GET',
          url: url.replace('/batch_get', `/${recordId}`),
          data: undefined,
        }) as { data?: { record?: unknown } };
        return detailResponse.data?.record;
      });
      responseData = { code: 0, data: { records } };
    } else {
      responseData = responder(config);
    }
    return {
      data: responseData,
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

function requestedReminderStatus(config: InternalAxiosRequestConfig): string {
  const data = parseRequestData(config) as {
    filter?: { conditions?: Array<{ value?: string[] }> };
  };
  return String(data.filter?.conditions?.[0]?.value?.[0] ?? '');
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
        进展状态: '待反馈',
        最近完成节点: '投递完成',
        公司: '示例公司',
        投递岗位: '',
        投递日期: Date.parse('2026-07-17T00:00:00+08:00'),
        '岗位 JD': '',
        公告链接: 'https://example.com/notice',
        投递链接: 'https://example.com/apply',
        '企业清单 record_id': 'rec_source',
        '投递记录 ID': 'enterprise:rec_source:default',
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
                  进展状态: '待二面',
                  最近完成节点: '一面完成',
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
        进展状态: '待二面',
        最近完成节点: '一面完成',
        公司: '新公司名',
        投递岗位: 'AI 产品经理',
        投递日期: Date.parse('2026-07-10T00:00:00+08:00'),
        '岗位 JD': '负责 AI 产品规划',
        公告链接: 'https://new.example/notice',
        投递链接: 'https://new.example/apply',
        '投递记录 ID': 'progress:rec_progress',
      },
    });
  });

  it('preserves and updates multiple jobs for one enterprise', async (): Promise<void> => {
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
                record_id: 'rec_job_one',
                fields: {
                  进展状态: '待一面',
                  最近完成节点: '笔试完成',
                  公司: '旧公司名',
                  投递岗位: 'AI 产品经理',
                  投递日期: Date.parse('2026-07-10T00:00:00+08:00'),
                  '岗位 JD': '岗位一',
                  '企业清单 record_id': 'rec_source',
                },
              },
              {
                record_id: 'rec_job_two',
                fields: {
                  进展状态: '待反馈',
                  最近完成节点: '投递完成',
                  公司: '旧公司名',
                  投递岗位: '策略产品经理',
                  投递日期: Date.parse('2026-07-11T00:00:00+08:00'),
                  '岗位 JD': '岗位二',
                  '企业清单 record_id': 'rec_source',
                  '投递记录 ID': 'manual:job-two',
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
    const updates: InternalAxiosRequestConfig[] = mock.calls.filter(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT',
    );
    expect(updates).toHaveLength(2);
    expect(parseRequestData(updates[0])).toMatchObject({
      fields: {
        投递岗位: 'AI 产品经理',
        '岗位 JD': '岗位一',
        '投递记录 ID': 'progress:rec_job_one',
      },
    });
    expect(parseRequestData(updates[1])).toMatchObject({
      fields: {
        投递岗位: '策略产品经理',
        '岗位 JD': '岗位二',
        '投递记录 ID': 'manual:job-two',
      },
    });
  });

  it('deletes an untouched generated default when the source is no longer submitted', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/source-base/tables/source-table/records/rec_source')) {
        return { code: 0, data: { record: { record_id: 'rec_source', fields: { 投递进度: '已拒绝' } } } };
      }
      if (url.includes('/records/search')) {
        return { code: 0, data: { items: [{
          record_id: 'rec_default',
          fields: {
            '投递记录 ID': 'enterprise:rec_source:default',
            进展状态: '待反馈',
            最近完成节点: '投递完成',
            投递岗位: '',
            '岗位 JD': '',
          },
        }] } };
      }
      return { code: 0, data: {} };
    });

    await expect(mock.service.sync({ sourceRecordId: 'rec_source' })).resolves.toEqual({
      ok: true,
      action: 'deleted',
      recordId: 'rec_default',
      matchedCount: 1,
      deletedCount: 1,
      protectedCount: 0,
    });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'DELETE'
        && String(config.url ?? '').endsWith('/rec_default'),
    )).toBe(true);
  });

  it('protects progressed or user-maintained records when the source is no longer submitted', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/source-base/tables/source-table/records/rec_source')) {
        return { code: 0, data: { record: { record_id: 'rec_source', fields: { 投递进度: '感兴趣' } } } };
      }
      if (url.includes('/records/search')) {
        return { code: 0, data: { items: [{
          record_id: 'rec_progressed',
          fields: {
            '投递记录 ID': 'enterprise:rec_source:default',
            进展状态: '待一面',
            最近完成节点: '笔试完成',
            投递岗位: 'AI 产品经理',
          },
        }] } };
      }
      return { code: 0, data: {} };
    });

    await expect(mock.service.sync({ sourceRecordId: 'rec_source' })).resolves.toEqual({
      ok: true,
      action: 'review_required',
      recordId: 'rec_progressed',
      matchedCount: 1,
      deletedCount: 0,
      protectedCount: 1,
    });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'DELETE',
    )).toBe(false);
  });

  it('sends the daily card after a complete single-owner member check', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/im/v1/chats/oc_daily/members')) {
        return {
          code: 0,
          data: {
            items: [{ member_id: 'ou_owner', name: 'Owner' }],
            member_total: 1,
            has_more: false,
            trigger_security_conf_limit: false,
          },
        };
      }
      if (url.includes('/reminder-base/tables/reminder-table/records/search')) {
        return requestedReminderStatus(config) === '待完成' ? {
          code: 0,
          data: {
            items: [{
              record_id: 'rec_event',
              fields: {
                公司: '示例公司',
                岗位: 'AI 产品经理',
                环节: '一面',
                开始时间: Date.now(),
                完成状态: '待完成',
              },
            }],
            has_more: false,
          },
        } : { code: 0, data: { items: [], has_more: false } };
      }
      if (url.includes('/im/v1/messages?receive_id_type=chat_id')) {
        return { code: 0, data: { message_id: 'om_daily' } };
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await expect(mock.service.sendDailyCheckin()).resolves.toEqual({
      status: 'sent',
      messageId: 'om_daily',
      eventCount: 1,
    });
    const sendCall: InternalAxiosRequestConfig | undefined = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').includes('/im/v1/messages?receive_id_type=chat_id'),
    );
    expect(sendCall).toBeDefined();
    const payload = parseRequestData(sendCall as InternalAxiosRequestConfig) as {
      receive_id: string;
      msg_type: string;
      content: string;
    };
    expect(payload.receive_id).toBe('oc_daily');
    expect(payload.msg_type).toBe('interactive');
    expect(JSON.parse(payload.content)).toMatchObject({
      schema: '2.0',
      header: { title: { content: 'OfferLoop 求职进展确认' } },
    });
    expect(payload.content).toContain('今日计划');
    expect(payload.content).toContain('已完成');
    expect(payload.content).toContain('尚未完成');
    expect(payload.content).toContain('"type":"callback"');
    expect(payload.content).not.toContain('打开飞书任务');
  });

  it('fails closed when the member list contains multiple humans', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/im/v1/chats/oc_daily/members')) {
        return {
          code: 0,
          data: {
            items: [{ member_id: 'ou_owner' }, { member_id: 'ou_other' }],
            member_total: 2,
            has_more: false,
            trigger_security_conf_limit: false,
          },
        };
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await expect(mock.service.sendDailyCheckin()).rejects.toThrow(
      'daily check-in requires exactly one human member',
    );
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').includes('/im/v1/messages'),
    )).toBe(false);
  });

  it('verifies the Feishu callback challenge token without network access', (): void => {
    const mock: MockService = createMockService(() => {
      throw new Error('no request expected');
    });
    expect(mock.service.verifyCallbackChallenge({
      challenge: 'challenge-value',
      token: 'verification-token',
    })).toEqual({ challenge: 'challenge-value' });
    expect(() => mock.service.verifyCallbackChallenge({
      challenge: 'challenge-value',
      token: 'wrong-token',
    })).toThrow('invalid Feishu callback challenge');
    expect(mock.calls).toHaveLength(0);
  });

  it('requires the workflow secret before reminder reconciliation', (): void => {
    const mock: MockService = createMockService(() => {
      throw new Error('no request expected');
    });
    expect(() => mock.service.verifyReminderReconcileSecret('workflow-secret')).not.toThrow();
    expect(() => mock.service.verifyReminderReconcileSecret('wrong-secret')).toThrow(
      'invalid reminder reconciliation secret',
    );
    expect(() => mock.service.verifyReminderReconcileSecret(undefined)).toThrow(
      'invalid reminder reconciliation secret',
    );
    expect(mock.calls).toHaveLength(0);
  });

  it('rejects an invalid reminder record id without network access', async (): Promise<void> => {
    const mock: MockService = createMockService(() => {
      throw new Error('no request expected');
    });
    await expect(mock.service.reconcileReminderRecord('invalid')).rejects.toThrow(
      'recordId is invalid',
    );
    expect(mock.calls).toHaveLength(0);
  });

  it('resolves a reminder record by its source email id', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/reminder-table/records/search')) {
        const data = parseRequestData(config) as {
          filter?: { conditions?: Array<{ field_name?: string; value?: string[] }> };
        };
        expect(data.filter?.conditions?.[0]).toEqual({
          field_name: '来源邮件ID',
          operator: 'is',
          value: ['mail-unique-id'],
        });
        return {
          code: 0,
          data: { items: [{ record_id: 'recResolved', fields: {} }], has_more: false },
        };
      }
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });

    await expect(
      mock.service.resolveReminderRecordId('mail-unique-id', 'fallback title'),
    ).resolves.toBe('recResolved');
  });

  it('caps the daily card at fifteen records and points to the remaining items', async (): Promise<void> => {
    const records = Array.from({ length: 16 }, (_, index: number) => ({
      record_id: `recEvent${index + 1}`,
      fields: {
        公司: `示例公司${index + 1}`,
        岗位: 'AI 产品经理',
        环节: '一面',
        开始时间: Date.now(),
        完成状态: '待完成',
      },
    }));
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/im/v1/chats/oc_daily/members')) {
        return {
          code: 0,
          data: {
            items: [{ member_id: 'ou_owner' }],
            member_total: 1,
            has_more: false,
            trigger_security_conf_limit: false,
          },
        };
      }
      if (url.includes('/reminder-base/tables/reminder-table/records/search')) {
        return requestedReminderStatus(config) === '待完成'
          ? { code: 0, data: { items: records, has_more: false } }
          : { code: 0, data: { items: [], has_more: false } };
      }
      if (url.includes('/im/v1/messages?receive_id_type=chat_id')) {
        return { code: 0, data: { message_id: 'om_capped' } };
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await expect(mock.service.sendDailyCheckin()).resolves.toMatchObject({
      status: 'sent',
      eventCount: 16,
    });
    const sendCall = mock.calls.find((config: InternalAxiosRequestConfig): boolean => (
      String(config.url ?? '').includes('/im/v1/messages?receive_id_type=chat_id')
    ));
    const payload = parseRequestData(sendCall as InternalAxiosRequestConfig) as { content: string };
    expect(payload.content).toContain('另有 1 条安排未在本卡片展开');
    expect(payload.content).toContain('recEvent15');
    expect(payload.content).not.toContain('recEvent16');
  });

  it('handles a completed card action by updating reminder and progress Bases', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.endsWith('/reminder-table/records/recEvent') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recEvent',
              fields: {
                完成状态: '待完成',
                环节: '一面',
                求职记录ID: '["recProgress"]',
              },
            },
          },
        };
      }
      if (url.includes('/reminder-table/records/search')) {
        return {
          code: 0,
          data: {
            items: [{
              record_id: 'recEvent',
              fields: {
                完成状态: '待完成',
                环节: '一面',
                求职记录ID: '["recProgress"]',
              },
            }],
            has_more: false,
          },
        };
      }
      if (url.endsWith('/reminder-table/records/recEvent') && method === 'PUT') {
        return { code: 0, data: { record: { record_id: 'recEvent', fields: {} } } };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recProgress',
              fields: {
                进展状态: '待一面',
                最近完成节点: '笔试完成',
              },
            },
          },
        };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'PUT') {
        return { code: 0, data: { record: { record_id: 'recProgress', fields: {} } } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.handleDailyCheckinAction({
      schema: '2.0',
      header: {
        token: 'verification-token',
        event_type: 'card.action.trigger',
        app_id: 'cli_test',
      },
      event: {
        operator: { open_id: 'ou_owner' },
        context: { open_chat_id: 'oc_daily' },
        action: {
          tag: 'button',
          value: { action: 'completed', record_id: 'recEvent' },
        },
      },
    })).resolves.toEqual({
      toast: { type: 'success', content: '已同步笔面试中心与求职进展。' },
    });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && JSON.stringify(parseRequestData(config)).includes('已完成'),
    )).toBe(true);
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').includes('/reminder-base/tables?page_size='),
    )).toBe(false);
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').includes('/task/v2/'),
    )).toBe(false);
  });

  it('keeps an incomplete card action pending without writing Base or calendar', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.endsWith('/reminder-table/records/recEvent')) {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recEvent',
              fields: { 完成状态: '待完成', 环节: '笔试' },
            },
          },
        };
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await expect(mock.service.handleDailyCheckinAction({
      schema: '2.0',
      header: {
        token: 'verification-token',
        event_type: 'card.action.trigger',
        app_id: 'cli_test',
      },
      event: {
        operator: { open_id: 'ou_owner' },
        context: { open_chat_id: 'oc_daily' },
        action: {
          tag: 'button',
          value: { action: 'incomplete', record_id: 'recEvent' },
        },
      },
    })).resolves.toEqual({
      toast: {
        type: 'info',
        content: '已记录为尚未完成，明天仍会提醒；真实截止时间不变。',
      },
    });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        ['PUT', 'POST', 'PATCH', 'DELETE'].includes(
          String(config.method ?? '').toUpperCase(),
        )
        && !String(config.url ?? '').endsWith('/auth/v3/tenant_access_token/internal'),
    )).toBe(false);
  });

  it('syncs pending invitations to all linked progress records without regression', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/reminder-table/records/search')) {
        return {
            code: 0,
            data: {
              items: [
                {
                  record_id: 'recExam',
                  fields: {
                    完成状态: '待完成',
                    环节: '笔试',
                    求职记录ID: '["recProgressA","recProgressB"]',
                    截止时间: Date.parse('2026-08-18T20:00:00+08:00'),
                  },
                },
                {
                  record_id: 'recSecondInterview',
                  fields: {
                    完成状态: '待完成',
                    环节: '二面',
                    求职记录ID: '["recProgressA"]',
                    开始时间: Date.parse('2026-08-19T10:00:00+08:00'),
                  },
                },
              ],
              has_more: false,
            },
          };
      }
      if (url.includes('/progress-table/records/recProgress')) {
        const recordId: string = url.endsWith('recProgressA')
          ? 'recProgressA'
          : 'recProgressB';
        if (method === 'GET') {
          return {
            code: 0,
            data: {
              record: {
                record_id: recordId,
                fields: {
                  进展状态: '待反馈',
                  最近完成节点: recordId === 'recProgressA' ? '一面完成' : '投递完成',
                },
              },
            },
          };
        }
        return { code: 0, data: { record: { record_id: recordId, fields: {} } } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.reconcileTaskStates()).resolves.toEqual({
      scanned: 2,
      provisioned: 0,
      completed: 0,
      missed: 0,
      postponed: 0,
      skipped: 0,
    });
    const progressUpdates = mock.calls.filter(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').includes('/progress-table/records/'),
    );
    expect(progressUpdates).toHaveLength(2);
    const updateA = progressUpdates.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').endsWith('/progress-table/records/recProgressA'),
    );
    const updateB = progressUpdates.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').endsWith('/progress-table/records/recProgressB'),
    );
    expect(parseRequestData(updateA as InternalAxiosRequestConfig)).toEqual({
      fields: { 进展状态: '待二面' },
    });
    expect(parseRequestData(updateB as InternalAxiosRequestConfig)).toEqual({
      fields: { 进展状态: '待笔试' },
    });
  });

  it('syncs manually completed events and preserves later progress', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/reminder-table/records/search')) {
        return {
            code: 0,
            data: {
              items: [{
                record_id: 'recCompletedInterview',
                fields: {
                  完成状态: '已完成',
                  环节: '二面',
                  求职记录ID: [{
                    type: 'text',
                    text: '["recProgressA","recProgressB"]',
                  }],
                },
              }],
              has_more: false,
            },
          };
      }
      if (url.endsWith('/progress-table/records/recProgressA') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recProgressA',
              fields: { 进展状态: '待二面', 最近完成节点: '一面完成' },
            },
          },
        };
      }
      if (url.endsWith('/progress-table/records/recProgressB') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recProgressB',
              fields: { 进展状态: '待反馈', 最近完成节点: '三面完成' },
            },
          },
        };
      }
      if (url.includes('/progress-table/records/recProgress') && method === 'PUT') {
        return { code: 0, data: { record: { record_id: 'updated', fields: {} } } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.reconcileTaskStates()).resolves.toEqual({
      scanned: 1,
      provisioned: 0,
      completed: 1,
      missed: 0,
      postponed: 0,
      skipped: 0,
    });
    const updateA = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/progress-table/records/recProgressA'),
    );
    expect(parseRequestData(updateA as InternalAxiosRequestConfig)).toEqual({
      fields: { 进展状态: '待反馈', 最近完成节点: '二面完成' },
    });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/progress-table/records/recProgressB'),
    )).toBe(false);
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').includes('/task/v2/tasks/'),
    )).toBe(false);
  });

  it('moves a manually missed latest event to status pending confirmation', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/reminder-table/records/search')) {
        return {
            code: 0,
            data: {
              items: [{
                record_id: 'recMissedInterview',
                fields: {
                  完成状态: '已错过',
                  环节: '一面',
                  求职记录ID: '["recProgress"]',
                },
              }],
              has_more: false,
            },
          };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recProgress',
              fields: {
                进展状态: '待一面',
                最近完成节点: '笔试完成',
              },
            },
          },
        };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'PUT') {
        return { code: 0, data: { record: { record_id: 'recProgress', fields: {} } } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.reconcileTaskStates()).resolves.toEqual({
      scanned: 1,
      provisioned: 0,
      completed: 0,
      missed: 1,
      postponed: 0,
      skipped: 0,
    });
    const progressUpdate = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/progress-table/records/recProgress'),
    );
    expect(parseRequestData(progressUpdate as InternalAxiosRequestConfig)).toEqual({
      fields: {
        进展状态: '状态待确认',
      },
    });
  });

  it('projects a completed single-table reminder into progress during reconciliation', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/reminder-table/records/search')) {
        return {
          code: 0,
          data: {
            items: [{
              record_id: 'recReminder',
              fields: {
                完成状态: '已完成',
                环节: '一面',
                求职记录ID: '["recProgress"]',
              },
            }],
            has_more: false,
          },
        };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recProgress',
              fields: {
                进展状态: '待一面',
                最近完成节点: '笔试完成',
              },
            },
          },
        };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'PUT') {
        return { code: 0, data: { record: { record_id: 'recProgress', fields: {} } } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.reconcileTaskStates()).resolves.toEqual({
      scanned: 1,
      provisioned: 0,
      completed: 1,
      missed: 0,
      postponed: 0,
      skipped: 0,
    });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').includes('/reminder-table/records/'),
    )).toBe(false);
    const progressUpdate = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/progress-table/records/recProgress'),
    );
    expect(parseRequestData(progressUpdate as InternalAxiosRequestConfig)).toEqual({
      fields: {
        进展状态: '待反馈',
        最近完成节点: '一面完成',
      },
    });
  });

  it('loads a shared progress record only once during full reconciliation', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/reminder-table/records/search')) {
        return {
          code: 0,
          data: {
            items: [
              {
                record_id: 'recWrittenExam',
                fields: {
                  完成状态: '已完成',
                  环节: '笔试',
                  求职记录ID: '["recSharedProgress"]',
                },
              },
              {
                record_id: 'recFirstInterview',
                fields: {
                  完成状态: '已完成',
                  环节: '一面',
                  求职记录ID: '["recSharedProgress"]',
                },
              },
            ],
            has_more: false,
          },
        };
      }
      if (url.endsWith('/progress-table/records/recSharedProgress') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recSharedProgress',
              fields: {
                进展状态: '待笔试',
                最近完成节点: '投递完成',
              },
            },
          },
        };
      }
      if (url.endsWith('/progress-table/records/recSharedProgress') && method === 'PUT') {
        return {
          code: 0,
          data: { record: { record_id: 'recSharedProgress', fields: {} } },
        };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.reconcileTaskStates()).resolves.toEqual({
      scanned: 2,
      provisioned: 0,
      completed: 2,
      missed: 0,
      postponed: 0,
      skipped: 0,
    });
    const batchRequests = mock.calls.filter(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method ?? '').toUpperCase() === 'POST'
        && String(config.url ?? '').endsWith('/progress-table/records/batch_get'),
    );
    expect(batchRequests).toHaveLength(1);
    expect(parseRequestData(batchRequests[0])).toEqual({
      record_ids: ['recSharedProgress'],
    });
  });

  it('reconciles a changed reminder immediately from its exact record id', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.endsWith('/reminder-table/records/recReminder') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recReminder',
              fields: {
                完成状态: '已完成',
                环节: '一面',
                求职记录ID: '["recProgress"]',
              },
            },
          },
        };
      }
      if (url.includes('/reminder-table/records/search')) {
        return { code: 0, data: { items: [], has_more: false } };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'GET') {
        return {
          code: 0,
          data: {
            record: {
              record_id: 'recProgress',
              fields: {
                进展状态: '待一面',
                最近完成节点: '笔试完成',
              },
            },
          },
        };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'PUT') {
        return { code: 0, data: { record: { record_id: 'recProgress', fields: {} } } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.reconcileReminderRecord('recReminder')).resolves.toEqual({
      ok: true,
      action: 'reconciled',
      recordId: 'recReminder',
      completionStatus: '已完成',
    });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/reminder-table/records/recReminder'),
    )).toBe(false);
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/progress-table/records/recProgress'),
    )).toBe(true);
  });

  it('reconciles pending Base rows without creating tasks or rewriting planned time', async (): Promise<void> => {
    const plannedAt: number = Date.parse('2026-08-15T10:00:00+08:00');
    const deadlineAt: number = Date.parse('2026-08-18T23:59:00+08:00');
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/reminder-table/records/search')) {
        return {
          code: 0,
          data: {
            items: [{
              record_id: 'recPending',
              fields: {
                完成状态: '待完成',
                环节: '笔试',
                开始时间: plannedAt,
                结束时间: plannedAt + 60 * 60 * 1000,
                截止时间: deadlineAt,
              },
            }],
            has_more: false,
          },
        };
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await expect(mock.service.reconcileTaskStates()).resolves.toEqual({
      scanned: 1,
      provisioned: 0,
      completed: 0,
      missed: 0,
      postponed: 0,
      skipped: 0,
    });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').includes('/task/v2/')
        || String(config.url ?? '').includes('/calendar/v4/'),
    )).toBe(false);
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method ?? '').toUpperCase() === 'PUT'
        && String(config.url ?? '').includes('/reminder-table/records/recPending'),
    )).toBe(false);
  });

});
