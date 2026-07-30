import type { HttpService } from '@nestjs/axios';
import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { of } from 'rxjs';

import type {
  ProductSenseFollowup,
  ProductSenseQuestion,
  ProductSenseSession,
} from '@shared/api.interface';
import {
  PM_SENSE_PARENT_NODE_TOKEN,
  PM_SENSE_SPACE_ID,
} from '../../shared/product-sense-config';

import {
  productSenseDailyQuestion,
  productSenseFeedback,
} from '../../server/database/schema';
import { ProductSenseService } from '../../server/modules/workbench/product-sense.service';

interface TestRow {
  id: string;
  owner: string;
  activeQuestionId: string;
  status: string;
  draft: string;
  followupAnswers: { [questionId: string]: string };
  selfSummary: string;
  dislikedQuestionIds: string[];
  completedQuestionIds: string[];
  archiveNodeToken: string | null;
  archiveUrl: string | null;
  updatedAt: Date;
}

interface TestFeedbackRow {
  id: string;
  owner: string;
  questionId: string;
  questionPrompt: string;
  company: string;
  sector: string;
  logicType: string;
  scopeType: string;
  knowledgeLevel: string;
  reason: string;
  factAnchor: string;
  sourceUrl: string;
  reasonDetail: string | null;
  inferredReason: string | null;
}

interface TestDailyRow {
  id: string;
  owner: string;
  questionDate: string;
  batchNo: number;
  position: number;
  questionId: string;
  company: string;
  prompt: string;
  logicType: string;
  sector: string;
  scopeType: string;
  knowledgeLevel: string;
  factAnchor: string;
  sourceLabel: string;
  sourceUrl: string;
  groupingPrompt: string;
  mecePrompt: string;
  status: string;
}

const createDailyRows = (): TestDailyRow[] => {
  const questionDate: string = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return ['微信', '小红书', 'B 站'].map(
    (company: string, index: number): TestDailyRow => ({
      id: `daily-${index + 1}`,
      owner: 'miaoda-user',
      questionDate,
      batchNo: 1,
      position: index + 1,
      questionId: `daily-question-${index + 1}`,
      company,
      prompt: `${company}为什么选择这个具体产品策略？`,
      logicType: index === 0 ? '产品逻辑' : '商业逻辑',
      sector: '内容社区',
      scopeType: '具体功能',
      knowledgeLevel: '大众认知',
      factAnchor: `${company}已经上线对应功能。`,
      sourceLabel: `${company}官方`,
      sourceUrl: `https://example.com/${index + 1}`,
      groupingPrompt: '请把原子判断归成互不重叠的原因组。',
      mecePrompt: '请检查重复、遗漏与关键反例。',
      status: 'available',
    }),
  );
};

const createDatabase = (initialDailyRows: TestDailyRow[] = []): {
  database: PostgresJsDatabase;
  getRow: () => TestRow | null;
  getFeedbackRows: () => TestFeedbackRow[];
  getDailyRows: () => TestDailyRow[];
} => {
  let row: TestRow | null = null;
  const feedbackRows: TestFeedbackRow[] = [];
  const dailyRows: TestDailyRow[] = initialDailyRows;
  const database = {
    select: () => ({
      from: (table: unknown) => ({
        where: async (): Promise<
          TestRow[] | TestFeedbackRow[] | TestDailyRow[]
        > => {
          if (table === productSenseFeedback) {
            return feedbackRows;
          }
          if (table === productSenseDailyQuestion) {
            return dailyRows;
          }
          return row ? [row] : [];
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (
        values: Partial<TestRow> | Partial<TestFeedbackRow>,
      ) => {
        if (table === productSenseFeedback) {
          feedbackRows.push({
            id: `feedback-${feedbackRows.length + 1}`,
            owner: String(values.owner),
            questionId: String(
              (values as Partial<TestFeedbackRow>).questionId,
            ),
            questionPrompt: String(
              (values as Partial<TestFeedbackRow>).questionPrompt,
            ),
            company: String(
              (values as Partial<TestFeedbackRow>).company,
            ),
            sector: String(
              (values as Partial<TestFeedbackRow>).sector,
            ),
            logicType: String(
              (values as Partial<TestFeedbackRow>).logicType,
            ),
            scopeType: String(
              (values as Partial<TestFeedbackRow>).scopeType,
            ),
            knowledgeLevel: String(
              (values as Partial<TestFeedbackRow>).knowledgeLevel,
            ),
            reason: String(
              (values as Partial<TestFeedbackRow>).reason,
            ),
            factAnchor: String(
              (values as Partial<TestFeedbackRow>).factAnchor,
            ),
            sourceUrl: String(
              (values as Partial<TestFeedbackRow>).sourceUrl,
            ),
            reasonDetail:
              (values as Partial<TestFeedbackRow>).reasonDetail ?? null,
            inferredReason:
              (values as Partial<TestFeedbackRow>).inferredReason ?? null,
          });
          return Promise.resolve();
        }
        const sessionValues: Partial<TestRow> =
          values as Partial<TestRow>;
        return {
          returning: async (): Promise<TestRow[]> => {
          row = {
            id: 'session-1',
            owner: String(sessionValues.owner),
            activeQuestionId: String(sessionValues.activeQuestionId),
            status: String(sessionValues.status),
            draft: String(sessionValues.draft),
            followupAnswers: sessionValues.followupAnswers ?? {},
            selfSummary: String(sessionValues.selfSummary),
            dislikedQuestionIds:
              sessionValues.dislikedQuestionIds ?? [],
            completedQuestionIds:
              sessionValues.completedQuestionIds ?? [],
            archiveNodeToken: null,
            archiveUrl: null,
            updatedAt: new Date(),
          };
          return [row];
          },
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Partial<TestRow> | Partial<TestDailyRow>) => ({
        where: async (): Promise<void> => {
          if (table === productSenseDailyQuestion) {
            const dailyValues: Partial<TestDailyRow> =
              values as Partial<TestDailyRow>;
            const target: TestDailyRow | undefined =
              dailyValues.status === 'completed'
                ? dailyRows.find(
                  (item: TestDailyRow): boolean =>
                    item.status === 'selected',
                )
                : dailyValues.status === 'disliked'
                  ? dailyRows.find(
                    (item: TestDailyRow): boolean =>
                      item.status === 'selected',
                  ) ?? dailyRows.find(
                    (item: TestDailyRow): boolean =>
                      item.status === 'available',
                  )
                : dailyRows.find(
                  (item: TestDailyRow): boolean =>
                    item.status === 'available',
                );
            if (target) {
              Object.assign(target, dailyValues);
            }
            return;
          }
          if (row) {
            row = { ...row, ...(values as Partial<TestRow>) };
          }
        },
      }),
    }),
  } as unknown as PostgresJsDatabase;
  return {
    database,
    getRow: (): TestRow | null => row,
    getFeedbackRows: (): TestFeedbackRow[] => feedbackRows,
    getDailyRows: (): TestDailyRow[] => dailyRows,
  };
};

describe('ProductSenseService', () => {
  it('automatically recommends a current and queued question on first load', async () => {
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );

    const session: ProductSenseSession =
      await service.getSession('miaoda-user');

    expect(session.question.company).toBe('淘宝');
    expect(session.queuedQuestion.company).toBe('抖音');
    expect(session.question.followups).toHaveLength(3);
    expect(
      session.question.followups.map(
        (followup: ProductSenseFollowup): string => followup.stage,
      ),
    ).toEqual(['atomize', 'group', 'mece']);
    expect(session.canSwitch).toBe(true);
    expect(session.dailyQuestions).toHaveLength(3);
    expect(session.preference.feedbackCount).toBe(0);
    expect(store.getRow()?.owner).toBe('miaoda-user');
  });

  it('shows three daily questions and unlocks regeneration after all are rejected', async () => {
    const store = createDatabase(createDailyRows());
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );

    let session: ProductSenseSession =
      await service.getSession('miaoda-user');
    expect(session.dailyQuestions).toHaveLength(3);
    expect(session.question.company).toBe('微信');

    for (const question of [...session.dailyQuestions]) {
      session = await service.switchQuestion(
        'miaoda-user',
        {
          questionId: question.id,
          reason: '不感兴趣',
        },
      );
    }

    expect(session.dailyQuestions).toHaveLength(0);
    expect(session.canRegenerate).toBe(true);
    expect(store.getDailyRows().every(
      (question: TestDailyRow): boolean =>
        question.status === 'disliked',
    )).toBe(true);
  });

  it('locks a selected daily question before Agent training starts', async () => {
    const store = createDatabase(createDailyRows());
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );

    const selected: ProductSenseSession = await service.selectQuestion(
      'miaoda-user',
      { questionId: 'daily-question-1' },
    );
    expect(selected.question.id).toBe('daily-question-1');

    await service.saveDraft('miaoda-user', {
      draft: '',
      followupAnswers: {},
      selfSummary: '',
      status: 'answering',
    });
    await expect(
      service.selectQuestion(
        'miaoda-user',
        { questionId: 'daily-question-2' },
      ),
    ).rejects.toThrow('已经锁定');
  });

  it('allows abandoning a selected daily question before it is archived', async () => {
    const store = createDatabase(createDailyRows());
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );

    await service.selectQuestion(
      'miaoda-user',
      { questionId: 'daily-question-1' },
    );
    await service.saveDraft('miaoda-user', {
      draft: '尚未归档的临时回答。',
      followupAnswers: { atomize: '临时判断' },
      selfSummary: '临时总结',
      status: 'answering',
    });

    const returned: ProductSenseSession = await service.switchQuestion(
      'miaoda-user',
      { questionId: 'daily-question-1', reason: '不感兴趣' },
    );

    expect(returned.status).toBe('recommended');
    expect(returned.question.id).toBe('daily-question-2');
    expect(returned.dailyQuestions.map(
      (question: ProductSenseQuestion): string => question.id,
    )).not.toContain('daily-question-1');
    expect(returned.draft).toBe('');
    expect(returned.followupAnswers).toEqual({});
    expect(returned.selfSummary).toBe('');
    expect(store.getDailyRows()[0]?.status).toBe('disliked');
    expect(store.getFeedbackRows()[0]?.questionId).toBe(
      'daily-question-1',
    );
  });

  it('keeps the latest wiki archive link visible after reloading', async () => {
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );
    await service.getSession('miaoda-user');

    const row: TestRow | null = store.getRow();
    expect(row).not.toBeNull();
    if (row) {
      row.archiveNodeToken = 'wiki-node-token';
      row.archiveUrl = 'https://feishu.cn/docx/legacy-token';
    }

    const reloaded: ProductSenseSession =
      await service.getSession('miaoda-user');
    expect(reloaded.lastArchiveUrl).toBe(
      'https://my.feishu.cn/wiki/wiki-node-token',
    );
  });

  it('records feedback and clears unarchived work when a user abandons a question', async () => {
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );
    await service.getSession('miaoda-user');

    const switched: ProductSenseSession = await service.switchQuestion(
      'miaoda-user',
      { reason: '不感兴趣' },
    );
    expect(switched.question.company).toBe('抖音');
    expect(switched.preference.feedbackCount).toBe(1);
    expect(switched.preference.learnedSignals).toContain(
      '降低相似公司与赛道',
    );
    expect(store.getFeedbackRows()).toHaveLength(1);
    expect(store.getFeedbackRows()[0]?.questionPrompt).toContain(
      '微信支付',
    );

    await service.saveDraft('miaoda-user', {
      draft: '这是已经开始填写的产品判断。',
      followupAnswers: {},
      selfSummary: '',
      status: 'answering',
    });

    const abandoned: ProductSenseSession = await service.switchQuestion(
      'miaoda-user',
      { reason: '范围太大' },
    );
    expect(abandoned.status).toBe('recommended');
    expect(abandoned.draft).toBe('');
    expect(abandoned.followupAnswers).toEqual({});
    expect(abandoned.selfSummary).toBe('');
    expect(store.getFeedbackRows()).toHaveLength(2);
  });

  it('stores and recognizes a custom dislike reason for memory', async () => {
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );
    await service.getSession('miaoda-user');

    const switched: ProductSenseSession = await service.switchQuestion(
      'miaoda-user',
      {
        reason: '其他原因',
        detail: '这个题目范围太宏观了，希望聚焦一个功能点',
      },
    );

    expect(store.getFeedbackRows()[0]?.reasonDetail).toContain('宏观');
    expect(store.getFeedbackRows()[0]?.inferredReason).toBe('范围太大');
    expect(switched.preference.learnedSignals).toContain(
      '优先聚焦具体功能点',
    );
  });

  it('requires a concrete explanation for other reasons', async () => {
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );

    await expect(
      service.switchQuestion(
        'miaoda-user',
        { reason: '其他原因', detail: '太泛' },
      ),
    ).rejects.toThrow('至少填写 4 个字');
    expect(store.getFeedbackRows()).toHaveLength(0);
  });

  it('advances only after validating a complete Agent wiki document', async () => {
    process.env.FEISHU_APP_ID = 'test-app-id';
    process.env.FEISHU_APP_SECRET = 'test-app-secret';
    const requiredSections: string[] = [
      '用户原始答案',
      '金字塔结构与 MECE 检查',
      '完整分析链路',
      '1 分钟答案',
      '3 分钟答案',
    ];
    const httpService = {
      post: jest.fn().mockReturnValue(of({
        data: {
          code: 0,
          tenant_access_token: 'test-token',
          expire: 7200,
        },
      })),
      get: jest.fn()
        .mockReturnValueOnce(of({
          data: {
            code: 0,
            data: {
              node: {
                node_token: 'agent-wiki-node',
                obj_token: 'agent-docx-token',
                obj_type: 'docx',
                space_id: '7663472168944012468',
                title: '2026-07-25｜淘宝｜产品 Sense 训练',
              },
            },
          },
        }))
        .mockReturnValueOnce(of({
          data: {
            code: 0,
            data: {
              items: requiredSections.map((section: string) => ({
                block_type: 4,
                heading2: {
                  elements: [{
                    text_run: { content: section },
                  }],
                },
              })),
            },
          },
        })),
    } as unknown as HttpService;
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      httpService,
    );
    await service.getSession('miaoda-user');
    await service.saveDraft('miaoda-user', {
      draft: '',
      followupAnswers: {},
      selfSummary: '',
      status: 'answering',
    });

    const completion = await service.completeExternal(
      'miaoda-user',
      {
        archiveUrl: 'https://my.feishu.cn/wiki/agent-wiki-node',
      },
    );

    expect(completion.archiveUrl).toBe(
      'https://my.feishu.cn/wiki/agent-wiki-node',
    );
    expect(completion.session.completedCount).toBe(1);
    expect(completion.session.question.company).toBe('抖音');
  });

  it('automatically discovers and completes the current Agent document', async () => {
    process.env.FEISHU_APP_ID = 'test-app-id';
    process.env.FEISHU_APP_SECRET = 'test-app-secret';
    const requiredSections: string[] = [
      '用户原始答案',
      '金字塔结构与 MECE 检查',
      '完整分析链路',
      '1 分钟答案',
      '3 分钟答案',
    ];
    const httpService = {
      post: jest.fn().mockReturnValue(of({
        data: {
          code: 0,
          tenant_access_token: 'test-token',
          expire: 7200,
        },
      })),
      get: jest.fn()
        .mockReturnValueOnce(of({
          data: {
            code: 0,
            data: {
              items: [{
                node_token: 'auto-wiki-node',
                obj_token: 'auto-docx-token',
                obj_type: 'docx',
                space_id: '7663472168944012468',
                title:
                  '淘宝｜产品 Sense｜taobao-wechat-pay',
                obj_edit_time: '1784983600',
              }],
              has_more: false,
            },
          },
        }))
        .mockReturnValueOnce(of({
          data: {
            code: 0,
            data: {
              node: {
                node_token: 'auto-wiki-node',
                obj_token: 'auto-docx-token',
                obj_type: 'docx',
                space_id: '7663472168944012468',
                title:
                  '淘宝｜产品 Sense｜taobao-wechat-pay',
              },
            },
          },
        }))
        .mockReturnValueOnce(of({
          data: {
            code: 0,
            data: {
              items: requiredSections.map((section: string) => ({
                block_type: 4,
                heading2: {
                  elements: [{
                    text_run: { content: section },
                  }],
                },
              })),
            },
          },
        })),
    } as unknown as HttpService;
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      httpService,
    );
    await service.getSession('miaoda-user');
    await service.saveDraft('miaoda-user', {
      draft: '',
      followupAnswers: {},
      selfSummary: '',
      status: 'answering',
    });

    const completion = await service.completeAutomatically(
      'miaoda-user',
    );

    expect(completion.completed).toBe(true);
    expect(httpService.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`/spaces/${PM_SENSE_SPACE_ID}/nodes`),
      expect.objectContaining({
        params: expect.objectContaining({
          parent_node_token: PM_SENSE_PARENT_NODE_TOKEN,
        }),
      }),
    );
    expect(completion.archiveUrl).toBe(
      'https://my.feishu.cn/wiki/auto-wiki-node',
    );
    expect(completion.session.completedCount).toBe(1);
    expect(completion.session.question.company).toBe('抖音');
  });

  it('keeps polling when no matching Agent document exists', async () => {
    process.env.FEISHU_APP_ID = 'test-app-id';
    process.env.FEISHU_APP_SECRET = 'test-app-secret';
    const httpService = {
      post: jest.fn().mockReturnValue(of({
        data: {
          code: 0,
          tenant_access_token: 'test-token',
          expire: 7200,
        },
      })),
      get: jest.fn().mockReturnValue(of({
        data: {
          code: 0,
          data: {
            items: [],
            has_more: false,
          },
        },
      })),
    } as unknown as HttpService;
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      httpService,
    );
    await service.getSession('miaoda-user');
    await service.saveDraft('miaoda-user', {
      draft: '',
      followupAnswers: {},
      selfSummary: '',
      status: 'answering',
    });

    const result = await service.completeAutomatically('miaoda-user');

    expect(result.completed).toBe(false);
    expect(result.message).toContain('等待 Agent');
    expect(store.getRow()?.activeQuestionId).toBe('taobao-wechat-pay');
  });

  it('keeps the question when the Agent archive link is invalid', async () => {
    const store = createDatabase();
    const service = new ProductSenseService(
      store.database,
      {} as HttpService,
    );
    await service.getSession('miaoda-user');
    await service.saveDraft('miaoda-user', {
      draft: '',
      followupAnswers: {},
      selfSummary: '',
      status: 'answering',
    });

    await expect(
      service.completeExternal(
        'miaoda-user',
        { archiveUrl: 'https://example.com/not-a-wiki-document' },
      ),
    ).rejects.toThrow('链接应为');
    expect(store.getRow()?.activeQuestionId).toBe('taobao-wechat-pay');
  });
});
