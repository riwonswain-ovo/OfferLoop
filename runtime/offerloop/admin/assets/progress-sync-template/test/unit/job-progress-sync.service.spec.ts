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
  REMINDER_RECONCILE_SECRET: 'workflow-secret',
  RUNTIME_STATE_TABLE_ID: 'runtime-state-table',
  DAILY_CHECKIN_STATUS: 'enabled',
  DAILY_CHECKIN_CHAT_ID: 'oc_daily',
  DAILY_CHECKIN_OWNER_OPEN_ID: 'ou_owner',
  DAILY_CHECKIN_CALENDAR_ID: 'cal_owner',
  FEISHU_CALLBACK_VERIFICATION_TOKEN: 'verification-token',
};

const UUID_V4_QUERY_PATTERN = /[?&]client_token=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:&|$)/u;
const CALENDAR_UUID_V4_QUERY_PATTERN = /[?&]idempotency_key=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:&|$)/u;

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
      try {
        responseData = await responder(config);
      } catch (error: unknown) {
        const method: string = String(config.method ?? '').toUpperCase();
        if (url.includes('/calendar/v4/calendars?page_size=500') && method === 'GET') {
          responseData = {
            code: 0,
            data: {
              calendar_list: [{
                calendar_id: 'cal_owner',
                summary: 'OfferLoop 求职日程',
                role: 'owner',
                is_deleted: false,
              }],
              has_more: false,
            },
          };
        } else if (url.includes('/attendees?user_id_type=open_id&page_size=100') && method === 'GET') {
          responseData = {
            code: 0,
            data: { items: [{ type: 'user', user_id: 'ou_owner' }] },
          };
        } else {
          throw error;
        }
      }
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

  it('authenticates the Feishu callback and sends the reschedule form as a new card', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.endsWith('/im/v1/messages?receive_id_type=chat_id')) {
        return { code: 0, data: { message_id: 'om_reschedule' } };
      }
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    const callback = {
      schema: '2.0',
      header: {
        token: 'verification-token',
        event_type: 'card.action.trigger',
        app_id: 'cli_test',
      },
      event: {
        operator: { open_id: 'ou_owner' },
        context: { open_chat_id: 'oc_daily', open_message_id: 'om_source' },
        action: {
          tag: 'button',
          value: { action: 'incomplete', record_id: 'recDaily' },
        },
      },
    };

    await expect(mock.service.acceptDailyCheckinAction(callback)).resolves.toEqual({
      toast: { type: 'info', content: '正在发送调整日程卡片' },
    });
    await expect(mock.service.acceptDailyCheckinAction({
      ...callback,
      header: { ...callback.header, token: 'wrong-token' },
    })).rejects.toThrow('invalid Feishu card action');
    const sendCall = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'POST'
        && String(config.url ?? '').endsWith('/im/v1/messages?receive_id_type=chat_id'),
    );
    expect(sendCall).toBeDefined();
    const sendBody = parseRequestData(sendCall!) as {
      receive_id?: string;
      msg_type?: string;
      content?: string;
      uuid?: string;
    };
    expect(sendBody).toMatchObject({
      receive_id: 'oc_daily',
      msg_type: 'interactive',
    });
    expect(sendBody.uuid).toMatch(/^[0-9a-f]{40}$/u);
    expect(JSON.parse(String(sendBody.content))).toMatchObject({
      schema: '2.0',
      header: { title: { content: '调整日程' } },
    });
    expect(String(sendBody.content)).not.toContain('[object Object]');
  });

  it('finishes a write action before returning the callback response', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    const handleAction = jest.spyOn(mock.service, 'handleDailyCheckinAction').mockResolvedValue({
      toast: { type: 'success', content: '关联进展已核对' },
    });
    const response = await mock.service.acceptDailyCheckinAction({
      schema: '2.0',
      header: {
        token: 'verification-token',
        event_type: 'card.action.trigger',
        app_id: 'cli_test',
      },
      event: {
        operator: { open_id: 'ou_owner' },
        context: { open_chat_id: 'oc_daily', open_message_id: 'om_callback' },
        action: {
          tag: 'button',
          value: { action: 'completed', record_id: 'recDaily', retry_failed_step: '求职进展联动' },
        },
      },
    });
    expect(response).toEqual({ toast: { type: 'success', content: '关联进展已核对' } });
    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(mock.calls).toHaveLength(0);
  });

  it('acknowledges immediately and sends the completed action as a new card', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.endsWith('/im/v1/messages?receive_id_type=chat_id')) {
        return { code: 0, data: { message_id: 'om_result' } };
      }
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    const callback = {
      schema: '2.0',
      header: {
        token: 'verification-token',
        event_type: 'card.action.trigger',
        app_id: 'cli_test',
      },
      event: {
        operator: { open_id: 'ou_owner' },
        context: { open_chat_id: 'oc_daily', open_message_id: 'om_callback' },
        action: {
          tag: 'button',
          value: { action: 'completed', record_id: 'recDaily' },
        },
      },
    };
    const handleAction = jest.spyOn(mock.service, 'handleDailyCheckinAction').mockResolvedValue({
      toast: { type: 'success', content: '已标记完成' },
    });

    expect(mock.service.acknowledgeDailyCheckinAction(callback)).toEqual({
      toast: { type: 'info', content: '请求已收到，处理结果会以新卡片发送' },
    });
    expect(handleAction).not.toHaveBeenCalled();
    await mock.service.processDailyCheckinActionAfterAck(callback);
    expect(handleAction).toHaveBeenCalledTimes(1);
    const sendCall = mock.calls.find((call): boolean => (
      String(call.method).toUpperCase() === 'POST'
      && String(call.url).endsWith('/im/v1/messages?receive_id_type=chat_id')
    ));
    const body = parseRequestData(sendCall!) as { content?: string };
    expect(JSON.parse(String(body.content))).toMatchObject({
      schema: '2.0',
      header: { title: { content: 'OfferLoop 操作完成' }, template: 'green' },
    });
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
              last_modified_time: '1787581200000',
              fields: {
                完成状态: '已完成',
                事件状态: '有效',
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
      if (url.includes('/runtime-state-table/records/search') && method === 'POST') {
        return { code: 0, data: { items: [] } };
      }
      if (url.includes('/runtime-state-table/records?client_token=') && method === 'POST') {
        return { code: 0, data: { record: { record_id: 'recReconcileClaim', fields: (parseRequestData(config) as { fields: Record<string, unknown> }).fields } } };
      }
      if (url.endsWith('/runtime-state-table/records/recReconcileClaim') && method === 'PUT') {
        return { code: 0, data: { record: { record_id: 'recReconcileClaim', fields: {} } } };
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
        String(config.method).toUpperCase() === 'POST'
        && String(config.url ?? '').includes('/runtime-state-table/records?client_token=')
        && UUID_V4_QUERY_PATTERN.test(String(config.url ?? '')),
    )).toBe(true);
    expect(mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'GET'
        && String(config.url ?? '').endsWith('/reminder-table/records/recReminder'),
    )?.params).toEqual({ automatic_fields: true });
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

  it('does not expose retired full-table or fallback locator methods', (): void => {
    const mock: MockService = createMockService(() => {
      throw new Error('network must not be used');
    });
    expect('reconcileTaskStates' in mock.service).toBe(false);
    expect('resolveReminderRecordId' in mock.service).toBe(false);
  });

  it('does not require or send daily-card resources when daily check-in is disabled', async (): Promise<void> => {
    process.env.DAILY_CHECKIN_STATUS = 'disabled';
    delete process.env.DAILY_CHECKIN_CHAT_ID;
    delete process.env.DAILY_CHECKIN_OWNER_OPEN_ID;
    delete process.env.DAILY_CHECKIN_CALENDAR_ID;
    const mock: MockService = createMockService(() => {
      throw new Error('network must not be used');
    });
    await expect(mock.service.sendDailyCheckin()).resolves.toEqual({ sent: false, count: 0 });
    expect(mock.calls).toHaveLength(0);
  });

  it('splits large daily histories and gives each card a stable message idempotency key', async (): Promise<void> => {
    const records = Array.from({ length: 26 }, (_, index) => ({
      record_id: `recDaily${index}`,
      fields: { 完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2099-08-30T18:00:00+08:00' },
    }));
    let ledgerCreates: number = 0;
    const ledger = new Map<string, { record_id: string; fields: Record<string, unknown> }>();
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.includes('/reminder-table/records/search')) return { code: 0, data: { items: records, has_more: false } };
      if (url.includes('/runtime-state-table/records/search')) {
        const body = parseRequestData(config) as { filter?: { conditions?: Array<{ value?: string[] }> } };
        const key = String(body.filter?.conditions?.[0]?.value?.[0] ?? '');
        return { code: 0, data: { items: ledger.has(key) ? [ledger.get(key)!] : [], has_more: false } };
      }
      if (url.includes('/runtime-state-table/records?client_token=')) {
        ledgerCreates += 1;
        const fields = (parseRequestData(config) as { fields: Record<string, unknown> }).fields;
        const record = { record_id: `recLedger${ledgerCreates}`, fields: { ...fields } };
        ledger.set(String(fields['幂等键']), record);
        return { code: 0, data: { record } };
      }
      if (url.includes('/runtime-state-table/records/recLedger')) {
        const record = [...ledger.values()].find((item) => url.endsWith(item.record_id));
        if (!record) throw new Error(`unknown ledger record: ${url}`);
        Object.assign(record.fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record } };
      }
      if (url.includes('/im/v1/messages?receive_id_type=chat_id')) return { code: 0, data: { message_id: 'om_daily' } };
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    await expect(mock.service.sendDailyCheckin(new Date('2026-08-24T22:10:00+08:00'))).resolves.toEqual({ sent: true, count: 26 });
    expect(mock.calls.some(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'POST'
        && String(config.url ?? '').includes('/runtime-state-table/records?client_token=')
        && UUID_V4_QUERY_PATTERN.test(String(config.url ?? '')),
    )).toBe(true);
    const sends = mock.calls.filter((call): boolean => String(call.url).includes('/im/v1/messages?'));
    expect(sends).toHaveLength(2);
    const uuids = sends.map((call): string => String((parseRequestData(call) as { uuid?: string }).uuid));
    expect(new Set(uuids).size).toBe(2);
    expect(uuids.every((uuid: string): boolean => uuid.length <= 50)).toBe(true);
    await expect(mock.service.sendDailyCheckin(new Date('2026-08-24T23:30:00+08:00'))).resolves.toEqual({ sent: true, count: 26 });
    expect(mock.calls.filter((call): boolean => String(call.url).includes('/im/v1/messages?'))).toHaveLength(2);
  });

  it('retries only the progress linkage when Base was already marked completed', async (): Promise<void> => {
    let progressReads: number = 0;
    const runtimeStates = new Map<string, { record_id: string; fields: Record<string, unknown> }>();
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'GET') {
        return { code: 0, data: { record: { record_id: 'recDaily', last_modified_time: '1787581200000', fields: { 完成状态: '已完成', 事件状态: '有效', 环节: '一面', 求职记录ID: '["recProgress"]' } } } };
      }
      if (url.includes('/reminder-table/records/search')) return { code: 0, data: { items: [], has_more: false } };
      if (url.endsWith('/progress-table/records/recProgress') && method === 'GET') {
        progressReads += 1;
        if (progressReads <= 3) return { code: 99991663, msg: 'temporary service error' };
        return { code: 0, data: { record: { record_id: 'recProgress', fields: { 进展状态: '待一面', 最近完成节点: '笔试完成' } } } };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'PUT') return { code: 0, data: { record: { record_id: 'recProgress', fields: {} } } };
      if (url.includes('/runtime-state-table/records/search') && method === 'POST') {
        const body = parseRequestData(config) as { filter?: { conditions?: Array<{ value?: string[] }> } };
        const key = String(body.filter?.conditions?.[0]?.value?.[0] ?? '');
        return { code: 0, data: { items: runtimeStates.has(key) ? [runtimeStates.get(key)!] : [] } };
      }
      if (url.includes('/runtime-state-table/records?client_token=') && method === 'POST') {
        const fields = { ...(parseRequestData(config) as { fields: Record<string, unknown> }).fields };
        const key = String(fields['幂等键']);
        const state = runtimeStates.get(key) ?? { record_id: `recRuntime${runtimeStates.size + 1}`, fields };
        runtimeStates.set(key, state);
        return { code: 0, data: { record: state } };
      }
      if (url.includes('/runtime-state-table/records/recRuntime') && method === 'PUT') {
        const state = [...runtimeStates.values()].find((item) => url.endsWith(item.record_id));
        if (!state) throw new Error(`unknown runtime record: ${url}`);
        Object.assign(state.fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: state } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    const payload = { operator_id: 'ou_owner', action_value: { action: 'completed', record_id: 'recDaily' } };
    await expect(mock.service.handleDailyCheckinAction(payload)).resolves.toMatchObject({ toast: { type: 'error' }, card: { type: 'raw' } });
    await expect(mock.service.handleDailyCheckinAction(payload)).resolves.toMatchObject({ toast: { type: 'info' } });
    expect(mock.calls.some((call): boolean => String(call.method).toUpperCase() === 'PUT' && String(call.url).endsWith('/reminder-table/records/recDaily'))).toBe(false);
    expect(mock.calls.some((call): boolean => String(call.method).toUpperCase() === 'PUT' && String(call.url).endsWith('/progress-table/records/recProgress'))).toBe(true);
    expect([...runtimeStates.values()].find((state) => state.fields['类型'] === 'reminder_reconcile')?.fields['状态']).toBe('成功');
  });

  it('does not let a stale daily card reverse an existing completion result', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.endsWith('/reminder-table/records/recDaily') && String(config.method).toUpperCase() === 'GET') {
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { 完成状态: '已完成' } } } };
      }
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    await expect(mock.service.handleDailyCheckinAction({
      operator_id: 'ou_owner',
      action_value: { action: 'missed', record_id: 'recDaily' },
    })).resolves.toMatchObject({ toast: { type: 'warning' } });
    expect(mock.calls.some((call): boolean => String(call.method).toUpperCase() === 'PUT')).toBe(false);
  });

  it('rejects a forged action that the current record group does not offer', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily') && String(config.method).toUpperCase() === 'GET') {
        return { code: 0, data: { record: { record_id: 'recDaily', fields: {
          完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步',
          截止时间: '2099-08-30T18:00:00+08:00',
        } } } };
      }
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    await expect(mock.service.handleDailyCheckinAction({
      operator_id: 'ou_owner',
      action_value: { action: 'missed', record_id: 'recDaily', group: 'deadline_overdue' },
    })).resolves.toMatchObject({ toast: { type: 'warning' } });
    expect(mock.calls.some((call): boolean => String(call.method).toUpperCase() === 'PUT')).toBe(false);
  });

  it('allows only one concurrent reconciliation to own the stable runtime claim', async (): Promise<void> => {
    let runtimeState: { record_id: string; fields: Record<string, unknown> } | undefined;
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recReminder') && method === 'GET') return { code: 0, data: { record: { record_id: 'recReminder', last_modified_time: '1787581200000', fields: { 完成状态: '已完成', 事件状态: '有效', 环节: '一面', 求职记录ID: '["recProgress"]' } } } };
      if (url.includes('/reminder-table/records/search')) return { code: 0, data: { items: [], has_more: false } };
      if (url.includes('/runtime-state-table/records/search') && method === 'POST') return { code: 0, data: { items: runtimeState ? [runtimeState] : [] } };
      if (url.includes('/runtime-state-table/records?client_token=') && method === 'POST') {
        runtimeState ??= { record_id: 'recClaim', fields: { ...(parseRequestData(config) as { fields: Record<string, unknown> }).fields } };
        return { code: 0, data: { record: runtimeState } };
      }
      if (url.endsWith('/runtime-state-table/records/recClaim') && method === 'PUT') {
        Object.assign(runtimeState!.fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: runtimeState } };
      }
      if (url.endsWith('/progress-table/records/recProgress') && method === 'GET') return { code: 0, data: { record: { record_id: 'recProgress', fields: { 进展状态: '待一面', 最近完成节点: '笔试完成' } } } };
      if (url.endsWith('/progress-table/records/recProgress') && method === 'PUT') return { code: 0, data: { record: { record_id: 'recProgress', fields: {} } } };
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    const results = await Promise.allSettled([
      mock.service.reconcileReminderRecord('recReminder'),
      mock.service.reconcileReminderRecord('recReminder'),
    ]);
    expect(results.filter((result): boolean => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result): boolean => result.status === 'rejected')).toHaveLength(1);
    expect(mock.calls.filter((call): boolean => String(call.method).toUpperCase() === 'PUT' && String(call.url).endsWith('/progress-table/records/recProgress'))).toHaveLength(1);
  });

  it('fails closed when Base omits the transition version needed for idempotency', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recReminder')) return { code: 0, data: { record: { record_id: 'recReminder', fields: { 完成状态: '已完成', 事件状态: '有效' } } } };
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    await expect(mock.service.reconcileReminderRecord('recReminder')).rejects.toThrow('last_modified_time');
    expect(mock.calls.some((call): boolean => String(call.url).includes('/runtime-state-table/'))).toBe(false);
  });

  it('does not project a cancelled event into job progress', async (): Promise<void> => {
    let runtimeState: { record_id: string; fields: Record<string, unknown> } | undefined;
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recReminder') && method === 'GET') return { code: 0, data: { record: { record_id: 'recReminder', last_modified_time: '1787581200000', fields: { 完成状态: '已完成', 事件状态: '已取消', 环节: '一面', 求职记录ID: '["recProgress"]' } } } };
      if (url.includes('/runtime-state-table/records/search')) return { code: 0, data: { items: runtimeState ? [runtimeState] : [] } };
      if (url.includes('/runtime-state-table/records?client_token=')) {
        runtimeState = { record_id: 'recClaim', fields: { ...(parseRequestData(config) as { fields: Record<string, unknown> }).fields } };
        return { code: 0, data: { record: runtimeState } };
      }
      if (url.endsWith('/runtime-state-table/records/recClaim') && method === 'PUT') {
        Object.assign(runtimeState!.fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: runtimeState } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    await expect(mock.service.reconcileReminderRecord('recReminder')).resolves.toMatchObject({ ok: true, completionStatus: '已完成' });
    expect(mock.calls.some((call): boolean => String(call.url).includes('/progress-table/'))).toBe(false);
  });

  it('opens the scheduling form on the first unplanned adjust click', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily')) return { code: 0, data: { record: { record_id: 'recDaily', fields: { 完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2099-08-30T18:00:00+08:00' } } } };
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    await expect(mock.service.handleDailyCheckinAction({ operator_id: 'ou_owner', action_value: { action: 'adjust', record_id: 'recDaily' } })).resolves.toMatchObject({ toast: { type: 'info' }, card: { type: 'raw' } });
    expect(mock.calls.some((call): boolean => String(call.url).includes('/calendar/v4/'))).toBe(false);
  });

  it('returns a friendly card response for invalid selected time', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily')) return { code: 0, data: { record: { record_id: 'recDaily', fields: { 完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2099-08-30T18:00:00+08:00' } } } };
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    await expect(mock.service.handleDailyCheckinAction({ operator_id: 'ou_owner', action_value: { action: 'adjust', record_id: 'recDaily' }, form_value: { planned_date: '', planned_start: '' } })).resolves.toMatchObject({ toast: { type: 'warning' }, card: { type: 'raw' } });
  });

  it('reuses the backfilled calendar id on a repeated adjustment', async (): Promise<void> => {
    const fields: Record<string, unknown> = {
      完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2099-08-30T18:00:00+08:00', 已建日程ID: '',
    };
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'GET') {
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      }
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'PUT') {
        Object.assign(fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      }
      if (url.includes('/calendar/v4/freebusy/list')) return { code: 0, data: { freebusy_list: [] } };
      if (url.includes('/calendar/v4/calendars/cal_owner/events/search_event?') && method === 'POST') return { code: 0, data: { items: [] } };
      if (url.includes('/calendar/v4/calendars/cal_owner/events?idempotency_key=') && method === 'POST') return { code: 0, data: { event: { event_id: 'evt-created' } } };
      if (url.endsWith('/calendar/v4/calendars/cal_owner/events/evt-created') && method === 'PATCH') return { code: 0, data: {} };
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    const pickerPayload = {
      operator_id: 'ou_owner',
      action_value: { action: 'adjust', record_id: 'recDaily' },
      form_value: { planned_date: '2099-08-25 +0800', planned_start: '15:30 +0800' },
    };
    await expect(mock.service.handleDailyCheckinAction(pickerPayload)).resolves.toMatchObject({ toast: { type: 'success' } });
    const payload = { operator_id: 'ou_owner', action_value: { action: 'adjust_confirmed', record_id: 'recDaily', planned_start: '2099-08-25T15:30:00+08:00' } };
    await expect(mock.service.handleDailyCheckinAction(payload)).resolves.toMatchObject({ toast: { type: 'success' } });
    const eventCreateCalls = mock.calls.filter((call): boolean => String(call.method).toUpperCase() === 'POST' && String(call.url).includes('/events?idempotency_key='));
    expect(eventCreateCalls).toHaveLength(1);
    expect(String(eventCreateCalls[0].url)).toMatch(CALENDAR_UUID_V4_QUERY_PATTERN);
    expect(fields['已建日程ID']).toBe('evt-created');
    expect(fields['开始时间']).toBe(Date.parse('2099-08-25T07:30:00.000Z'));
    expect(fields['结束时间']).toBe(Date.parse('2099-08-25T09:00:00.000Z'));
  });

  it('uses the configured owner calendar and adds the owner to a migrated event', async (): Promise<void> => {
    const fields: Record<string, unknown> = {
      完成状态: '待完成',
      事件状态: '有效',
      环节: '测评',
      进行方式: '异步',
      安排名称: '示例公司－测评',
      截止时间: '2099-08-30T18:00:00+08:00',
      '预计时长（分钟）': 70,
      已建日程ID: 'evt-personal',
    };
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'GET') {
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      }
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'PUT') {
        Object.assign(fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      }
      if (url.includes('/calendar/v4/calendars?page_size=500') && method === 'GET') {
        return { code: 0, data: { calendar_list: [{ calendar_id: 'cal_owner', summary: 'OfferLoop 求职日程', role: 'owner', is_deleted: false }], has_more: false } };
      }
      if (url.endsWith('/calendar/v4/calendars/cal_owner/events/evt-personal') && method === 'PATCH') {
        return { code: 191002, msg: 'no calendar access_role' };
      }
      if (url.includes('/calendar/v4/calendars/cal_owner/events/search_event?') && method === 'POST') {
        return { code: 0, data: { items: [] } };
      }
      if (url.includes('/calendar/v4/calendars/cal_owner/events?idempotency_key=') && method === 'POST') {
        return { code: 0, data: { event: { event_id: 'evt-managed' } } };
      }
      if (url.includes('/events/evt-managed/attendees?user_id_type=open_id&page_size=100') && method === 'GET') {
        return { code: 0, data: { items: [] } };
      }
      if (url.endsWith('/events/evt-managed/attendees?user_id_type=open_id') && method === 'POST') {
        return { code: 0, data: { attendees: [{ type: 'user', user_id: 'ou_owner' }] } };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    const result = await mock.service.rescheduleReminderRecord(
      'recDaily',
      '2099-08-25T15:30:00+08:00',
    );

    expect(result).toMatchObject({ ok: true, managedCalendarId: 'cal_owner' });
    expect(fields).toMatchObject({ 日历状态: '已建日程', 已建日程ID: 'evt-managed' });
    const attendeeCall = mock.calls.find((call): boolean => (
      String(call.method).toUpperCase() === 'POST'
      && String(call.url).endsWith('/events/evt-managed/attendees?user_id_type=open_id')
    ));
    expect(parseRequestData(attendeeCall!)).toMatchObject({
      attendees: [{ type: 'user', user_id: 'ou_owner' }],
    });
  });

  it('uses a configured writer calendar without creating a fallback calendar or inviting the owner', async (): Promise<void> => {
    const fields: Record<string, unknown> = {
      完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步',
      安排名称: '隔离验收－测评', 截止时间: '2099-08-30T18:00:00+08:00', 已建日程ID: '',
    };
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'GET') return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'PUT') {
        Object.assign(fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      }
      if (url.includes('/calendar/v4/calendars?page_size=500') && method === 'GET') {
        return { code: 0, data: { calendar_list: [{ calendar_id: 'cal_owner', summary: '隔离测试日历', role: 'writer', is_deleted: false }], has_more: false } };
      }
      if (url.includes('/calendar/v4/calendars/cal_owner/events/search_event?') && method === 'POST') return { code: 0, data: { items: [] } };
      if (url.includes('/calendar/v4/calendars/cal_owner/events?idempotency_key=') && method === 'POST') return { code: 0, data: { event: { event_id: 'evt-isolated' } } };
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.rescheduleReminderRecord(
      'recDaily',
      '2099-08-25T15:30:00+08:00',
    )).resolves.toMatchObject({ ok: true, managedCalendarId: 'cal_owner' });
    expect(mock.calls.some((call): boolean => (
      String(call.method).toUpperCase() === 'POST'
      && String(call.url).endsWith('/calendar/v4/calendars')
    ))).toBe(false);
    expect(mock.calls.some((call): boolean => String(call.url).includes('/attendees'))).toBe(false);
  });

  it('fails closed when the configured calendar is not visible', async (): Promise<void> => {
    const fields: Record<string, unknown> = {
      完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步',
      安排名称: '隔离验收－测评', 截止时间: '2099-08-30T18:00:00+08:00', 已建日程ID: '',
    };
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'GET') return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'PUT') {
        Object.assign(fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      }
      if (url.includes('/calendar/v4/calendars?page_size=500') && method === 'GET') return { code: 0, data: { calendar_list: [], has_more: false } };
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.rescheduleReminderRecord(
      'recDaily',
      '2099-08-25T15:30:00+08:00',
    )).rejects.toThrow('configured daily check-in calendar is not visible to the app');
    expect(mock.calls.some((call): boolean => (
      String(call.method).toUpperCase() === 'POST'
      && String(call.url).endsWith('/calendar/v4/calendars')
    ))).toBe(false);
  });

  it('recovers a calendar event created before Base backfill failed', async (): Promise<void> => {
    const fields: Record<string, unknown> = {
      完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 安排名称: '示例公司－测评',
      开始时间: Date.parse('2099-08-25T07:30:00.000Z'),
      结束时间: Date.parse('2099-08-25T09:00:00.000Z'),
      截止时间: '2099-08-30T18:00:00+08:00', 已建日程ID: 'pending:old-action-key',
    };
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'GET') return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'PUT') {
        Object.assign(fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      }
      if (url.includes('/events/search_event?') && method === 'POST') return { code: 0, data: { items: [{ meta_data: { event_id: 'evt-recovered' } }] } };
      if (url.endsWith('/events/evt-recovered') && method === 'GET') return { code: 0, data: { event: { event_id: 'evt-recovered', description: 'OfferLoop action old-action-key' } } };
      if (url.endsWith('/events/evt-recovered') && method === 'PATCH') return { code: 0, data: {} };
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    await expect(mock.service.handleDailyCheckinAction({ operator_id: 'ou_owner', action_value: { action: 'adjust_confirmed', record_id: 'recDaily', planned_start: '2099-08-25T15:30:00+08:00' } })).resolves.toMatchObject({ toast: { type: 'success' } });
    expect(mock.calls.some((call): boolean => String(call.method).toUpperCase() === 'POST' && String(call.url).includes('/events?idempotency_key='))).toBe(false);
    expect(fields['已建日程ID']).toBe('evt-recovered');
  });

  it('warns before adjusting into a personal-calendar conflict', async (): Promise<void> => {
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily')) return { code: 0, data: { record: { record_id: 'recDaily', fields: { 完成状态: '待完成', 事件状态: '有效', 环节: '笔试', 进行方式: '异步', 截止时间: '2099-08-30T18:00:00+08:00' } } } };
      if (url.includes('/calendar/v4/freebusy/list')) return { code: 0, data: { freebusy_list: [{ start_time: '2099-08-25T15:00:00+08:00', end_time: '2099-08-25T17:00:00+08:00' }] } };
      throw new Error(`unexpected request: ${String(config.method)} ${url}`);
    });
    const result = await mock.service.handleDailyCheckinAction({ operator_id: 'ou_owner', action_value: { action: 'adjust', record_id: 'recDaily' }, form_value: { planned_date: '2099-08-25', planned_start: '15:30' } });
    expect(result).toMatchObject({ toast: { type: 'warning' }, card: { type: 'raw' } });
    expect(mock.calls.some((call): boolean => String(call.url).includes('/calendar/v4/calendars/cal_owner/events'))).toBe(false);
  });

  it('does not treat the existing OfferLoop calendar event as its own conflict', async (): Promise<void> => {
    jest.useFakeTimers().setSystemTime(new Date('2099-08-25T12:00:00+08:00'));
    const fields: Record<string, unknown> = {
      完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 安排名称: '甲－测评',
      平台: '牛客', 链接: { link: 'https://example.com/test', text: '开始测评' }, 注意事项: '需要摄像头',
      开始时间: '2099-08-25T15:00:00+08:00', 结束时间: '2099-08-25T16:30:00+08:00',
      截止时间: '2099-08-30T18:00:00+08:00', 已建日程ID: 'evt-own',
    };
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'GET') return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'PUT') return { code: 0, data: { record: { record_id: 'recDaily', fields: {} } } };
      if (url.includes('/calendar/v4/freebusy/list')) return { code: 0, data: { freebusy_list: [{}] } };
      if (url.endsWith('/events/evt-own') && method === 'GET') return { code: 0, data: { event: { start_time: { timestamp: String(Date.parse('2099-08-25T15:00:00+08:00') / 1000) }, end_time: { timestamp: String(Date.parse('2099-08-25T16:30:00+08:00') / 1000) } } } };
      if (url.endsWith('/events/evt-own') && method === 'PATCH') return { code: 0, data: {} };
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    await expect(mock.service.handleDailyCheckinAction({ operator_id: 'ou_owner', action_value: { action: 'adjust', record_id: 'recDaily' }, form_value: { planned_date: '2099-08-25', planned_start: '15:30' } })).resolves.toMatchObject({ toast: { type: 'success' } });
    const patchCall = mock.calls.find((call): boolean => String(call.url).endsWith('/events/evt-own') && String(call.method).toUpperCase() === 'PATCH');
    expect(String((parseRequestData(patchCall!) as { description?: string }).description)).toContain('参与链接：https://example.com/test');
    jest.useRealTimers();
  });

  it('retries transient calendar codes three times and records an operation failure', async (): Promise<void> => {
    const fields: Record<string, unknown> = { 完成状态: '待完成', 事件状态: '有效', 环节: '测评', 进行方式: '异步', 截止时间: '2099-08-30T18:00:00+08:00', 已建日程ID: '' };
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      const method: string = String(config.method ?? '').toUpperCase();
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'GET') return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      if (url.endsWith('/reminder-table/records/recDaily') && method === 'PUT') {
        Object.assign(fields, (parseRequestData(config) as { fields: Record<string, unknown> }).fields);
        return { code: 0, data: { record: { record_id: 'recDaily', fields: { ...fields } } } };
      }
      if (url.includes('/calendar/v4/calendars/cal_owner/events/search_event?') && method === 'POST') return { code: 0, data: { items: [] } };
      if (url.includes('/calendar/v4/calendars/cal_owner/events?idempotency_key=') && method === 'POST') return { code: 99991663, msg: 'temporary service error' };
      if (url.includes('/runtime-state-table/records/search') && method === 'POST') return { code: 0, data: { items: [] } };
      if (url.includes('/runtime-state-table/records?client_token=') && method === 'POST') return { code: 0, data: { record: { record_id: 'recFailure', fields: (parseRequestData(config) as { fields: Record<string, unknown> }).fields } } };
      throw new Error(`unexpected request: ${method} ${url}`);
    });
    const result = await mock.service.handleDailyCheckinAction({ operator_id: 'ou_owner', action_value: { action: 'adjust_confirmed', record_id: 'recDaily', planned_start: '2099-08-25T15:30:00+08:00' } });
    expect(result).toMatchObject({ toast: { type: 'error' }, card: { type: 'raw' } });
    expect(mock.calls.filter((call): boolean => String(call.method).toUpperCase() === 'POST' && String(call.url).includes('/events?idempotency_key='))).toHaveLength(3);
    expect(fields['日历状态']).toBe('操作失败');
    expect(String(fields['已建日程ID'])).toMatch(/^pending:/u);
    expect(mock.calls.some((call): boolean => String(call.url).includes('/runtime-state-table/records?client_token='))).toBe(true);
  });

});
