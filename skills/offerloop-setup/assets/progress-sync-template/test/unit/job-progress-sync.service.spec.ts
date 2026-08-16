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
  REMINDER_TASKLIST_GUID: 'tasklist-guid',
  DAILY_CHECKIN_CHAT_ID: 'oc_daily',
  DAILY_CHECKIN_OWNER_OPEN_ID: 'ou_owner',
  DAILY_CHECKIN_STATUS: 'enabled',
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
        进展状态: '待反馈',
        最近完成节点: '投递完成',
        当前阶段: '已投递',
        下一环节: '待反馈',
        流程结果: '进行中',
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
        进展状态: '待二面',
        当前阶段: '二面',
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
                  当前阶段: '一面',
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
                  当前阶段: '已投递',
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
            当前阶段: '已投递',
            下一环节: '待反馈',
            流程结果: '进行中',
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
        return {
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
        };
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
    expect(payload.content).toContain('打开飞书任务');
    expect(payload.content).toContain('"type":"open_url"');
    expect(payload.content).not.toContain('"type":"callback"');
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

  it('reconciles a completed native Feishu task into reminder and progress Bases', async (): Promise<void> => {
    let reminderSearchCount = 0;
    const mock: MockService = createMockService((config: InternalAxiosRequestConfig) => {
      const url: string = String(config.url ?? '');
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return { code: 0, tenant_access_token: 'tenant-token', expire: 7200 };
      }
      if (url.includes('/reminder-table/records/search')) {
        reminderSearchCount += 1;
        return reminderSearchCount === 1
          ? {
            code: 0,
            data: {
              items: [{
                record_id: 'recEvent',
                fields: {
                  完成状态: '待完成',
                  环节: '一面',
                  求职记录ID: 'recProgress',
                  飞书任务GUID: 'task-main',
                  未参加任务GUID: 'task-missed',
                  开始时间: Date.parse('2026-08-11T14:30:00+08:00'),
                },
              }],
              has_more: false,
            },
          }
          : { code: 0, data: { items: [], has_more: false } };
      }
      if (url.includes('/task/v2/tasks/task-main')) {
        return { code: 0, data: { task: { guid: 'task-main', status: 'done' } } };
      }
      if (url.includes('/task/v2/tasks/task-missed')) {
        return { code: 0, data: { task: { guid: 'task-missed', status: 'todo' } } };
      }
      if (url.endsWith('/progress-table/records/recProgress')) {
        if (String(config.method).toUpperCase() === 'GET') {
          return {
            code: 0,
            data: {
              record: {
                record_id: 'recProgress',
                fields: {
                  进展状态: '待一面',
                  最近完成节点: '笔试完成',
                  下一环节: '一面',
                  流程结果: '进行中',
                },
              },
            },
          };
        }
        return { code: 0, data: { record: { record_id: 'recProgress', fields: {} } } };
      }
      if (url.endsWith('/reminder-table/records/recEvent')) {
        return { code: 0, data: { record: { record_id: 'recEvent', fields: {} } } };
      }
      throw new Error(`unexpected request: ${url}`);
    });

    await expect(mock.service.reconcileTaskStates()).resolves.toEqual({
      scanned: 1,
      provisioned: 0,
      completed: 1,
      missed: 0,
      postponed: 0,
      skipped: 0,
    });
    const reminderUpdate = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/reminder-table/records/recEvent')
        && JSON.stringify(parseRequestData(config)).includes('已完成'),
    );
    const progressUpdate = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.method).toUpperCase() === 'PUT'
        && String(config.url ?? '').endsWith('/progress-table/records/recProgress'),
    );
    expect(parseRequestData(reminderUpdate as InternalAxiosRequestConfig)).toEqual({
      fields: { 完成状态: '已完成' },
    });
    expect(parseRequestData(progressUpdate as InternalAxiosRequestConfig)).toEqual({
      fields: {
        进展状态: '待反馈',
        最近完成节点: '一面完成',
        下一环节: '待反馈',
      },
    });
  });

  it('idempotently provisions native Feishu tasks for an unmapped reminder', async (): Promise<void> => {
    const dueAt: number = Date.parse('2026-08-15T10:00:00+08:00');
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
              record_id: 'recUnmapped',
              fields: {
                完成状态: '待完成',
                环节: '一面',
                公司: '示例公司',
                岗位: 'AI 产品经理',
                开始时间: dueAt,
              },
            }],
            has_more: false,
          },
        };
      }
      if (url.endsWith('/task/v2/tasks?user_id_type=open_id') && method === 'POST') {
        return {
          code: 0,
          data: {
            task: {
              guid: 'task-created',
              status: 'todo',
              url: 'https://applink.feishu.cn/client/todo/detail?guid=task-created',
            },
          },
        };
      }
      if (url.includes('/task/v2/tasks/task-created/subtasks') && method === 'POST') {
        return {
          code: 0,
          data: { subtask: { guid: 'task-missed-created', status: 'todo' } },
        };
      }
      if (url.endsWith('/reminder-table/records/recUnmapped') && method === 'PUT') {
        return {
          code: 0,
          data: { record: { record_id: 'recUnmapped', fields: {} } },
        };
      }
      if (url.includes('/task/v2/tasks/task-created?')) {
        return {
          code: 0,
          data: { task: { guid: 'task-created', status: 'todo', due: { timestamp: String(dueAt) } } },
        };
      }
      if (url.includes('/task/v2/tasks/task-missed-created?')) {
        return {
          code: 0,
          data: { task: { guid: 'task-missed-created', status: 'todo' } },
        };
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    });

    await expect(mock.service.reconcileTaskStates()).resolves.toEqual({
      scanned: 1,
      provisioned: 1,
      completed: 0,
      missed: 0,
      postponed: 0,
      skipped: 0,
    });
    const createTaskCall = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').endsWith('/task/v2/tasks?user_id_type=open_id')
        && String(config.method).toUpperCase() === 'POST',
    );
    const createTaskPayload = parseRequestData(
      createTaskCall as InternalAxiosRequestConfig,
    ) as Record<string, unknown>;
    expect(createTaskPayload).toMatchObject({
      summary: '面试｜示例公司｜AI 产品经理｜一面',
      due: { timestamp: String(dueAt), is_all_day: false },
      members: [{ id: 'ou_owner', type: 'user', role: 'assignee' }],
      tasklists: [{ tasklist_guid: 'tasklist-guid' }],
    });
    expect(createTaskPayload.client_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    const mappingUpdate = mock.calls.find(
      (config: InternalAxiosRequestConfig): boolean =>
        String(config.url ?? '').endsWith('/reminder-table/records/recUnmapped')
        && String(config.method).toUpperCase() === 'PUT',
    );
    expect(parseRequestData(mappingUpdate as InternalAxiosRequestConfig)).toEqual({
      fields: {
        飞书任务GUID: 'task-created',
        未参加任务GUID: 'task-missed-created',
        飞书任务链接: {
          link: 'https://applink.feishu.cn/client/todo/detail?guid=task-created',
          text: '打开飞书任务',
        },
      },
    });
  });

});
