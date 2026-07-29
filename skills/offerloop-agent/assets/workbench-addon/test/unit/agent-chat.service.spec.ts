import type {
  AgentChatStore,
  CreateStoredRunInput,
  StoredConversationRun,
} from '../../server/modules/agent-chat/agent-chat.repository';
import { AgentChatService } from '../../server/modules/agent-chat/agent-chat.service';

const SESSION_ID: string = '019fa268-8999-79b1-bef7-d2a43bfc81a6';

const createStore = (): jest.Mocked<AgentChatStore> =>
  ({
    claimNextRun: jest.fn(),
    createAnsweredRun: jest.fn().mockResolvedValue('instant-run'),
    createRun: jest
      .fn()
      .mockResolvedValue('019fa268-a999-7777-bef7-d2a43bfc81a6'),
    getRun: jest.fn(),
    hasConnectedWorker: jest.fn().mockResolvedValue(true),
    heartbeatWorker: jest.fn(),
    listConversationRuns: jest.fn().mockResolvedValue([]),
    listConversationRunsBySession: jest.fn().mockResolvedValue([]),
    markConversationRecovered: jest.fn(),
    recoverExpiredRuns: jest.fn(),
    requestRunCancellation: jest.fn(),
    updateRun: jest.fn(),
  }) as jest.Mocked<AgentChatStore>;

describe('AgentChatService owner isolation', () => {
  it('checks only the current user worker before creating a task', async () => {
    const store = createStore();
    const service = new AgentChatService(store);

    await service.createRun('100000000000001', {
      message: '帮我分析这个岗位是否适合我',
    });

    expect(store.hasConnectedWorker).toHaveBeenCalledWith(
      '100000000000001',
      expect.any(Date),
    );
    expect(store.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: '100000000000001',
      }) as CreateStoredRunInput,
    );
  });

  it('queues a native Codex thread as soon as a conversation is created', async () => {
    const store = createStore();
    const service = new AgentChatService(store);

    const response = await service.createConversation('100000000000001');

    expect(response).toEqual({
      runId: '019fa268-a999-7777-bef7-d2a43bfc81a6',
      state: 'started',
    });
    expect(store.createRun).toHaveBeenCalledWith({
      confirmed: true,
      message: '新建 OfferLoop 对话',
      owner: '100000000000001',
      route: '__codex_new_thread__',
    });
  });

  it('hides the new-thread control task from conversation messages', async () => {
    const store = createStore();
    const service = new AgentChatService(store);
    const createdAt: Date = new Date('2026-07-27T10:00:00.000Z');
    const bootstrapRun: StoredConversationRun = {
      createdAt,
      id: '019fa268-a999-7777-bef7-d2a43bfc81a6',
      message: '新建 OfferLoop 对话',
      progress: '已完成',
      result: '新对话已创建。',
      route: '__codex_new_thread__',
      sessionId: SESSION_ID,
      status: 'completed',
      updatedAt: createdAt,
    };
    store.listConversationRunsBySession.mockResolvedValue([bootstrapRun]);

    const detail = await service.getConversation('100000000000001', SESSION_ID);

    expect(detail.conversation).toEqual(
      expect.objectContaining({
        messageCount: 0,
        route: 'chat',
        title: '新对话',
      }),
    );
    expect(detail.messages).toEqual([]);
  });

  it('claims tasks with the worker owner binding', async () => {
    const store = createStore();
    const service = new AgentChatService(store);

    await service.pollWorker({
      codexAvailable: true,
      displayName: 'OfferLoop Mac',
      ownerId: '100000000000002',
      workerId: 'offerloop-100000000000002-mac',
    });

    expect(store.heartbeatWorker).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: '100000000000002' }),
    );
    expect(store.claimNextRun).toHaveBeenCalledWith(
      '100000000000002',
      'offerloop-100000000000002-mac',
      expect.any(Date),
    );
  });

  it('rejects a Feishu open_id as a worker owner', async () => {
    const service = new AgentChatService(createStore());

    await expect(
      service.pollWorker({
        codexAvailable: true,
        displayName: 'OfferLoop Mac',
        ownerId: 'ou_not_a_miaoda_user_id',
        workerId: 'offerloop-invalid-owner-mac',
      }),
    ).rejects.toThrow('Worker 所属妙搭用户 ID 无效');
  });

  it('binds result updates to the same owner and worker', async () => {
    const store = createStore();
    store.updateRun.mockResolvedValue('updated');
    const service = new AgentChatService(store);

    await service.updateWorkerRun('019fa268-a999-7777-bef7-d2a43bfc81a6', {
      ownerId: '100000000000003',
      progress: '正在执行',
      status: 'running',
      workerId: 'offerloop-100000000000003-mac',
    });

    expect(store.updateRun).toHaveBeenCalledWith(
      '100000000000003',
      '019fa268-a999-7777-bef7-d2a43bfc81a6',
      expect.objectContaining({
        ownerId: '100000000000003',
        workerId: 'offerloop-100000000000003-mac',
      }),
      expect.any(Date),
    );
  });

  it('marks the old conversation archived after Codex creates a replacement thread', async () => {
    const store = createStore();
    store.updateRun.mockResolvedValue('updated');
    const service = new AgentChatService(store);
    const recoveredFromSessionId: string =
      '019fa268-8999-79b1-bef7-d2a43bfc81a6';
    const replacementSessionId: string =
      '019fa268-8999-79b1-bef7-d2a43bfc81a7';

    await service.updateWorkerRun('019fa268-a999-7777-bef7-d2a43bfc81a6', {
      ownerId: '100000000000003',
      progress: '旧对话已归档，正在新对话中继续任务',
      recoveredFromSessionId,
      sessionId: replacementSessionId,
      status: 'running',
      workerId: 'offerloop-100000000000003-mac',
    });

    expect(store.markConversationRecovered).toHaveBeenCalledWith(
      '100000000000003',
      recoveredFromSessionId,
    );
  });

  it('rejects recovery updates that do not include a distinct new session', async () => {
    const service = new AgentChatService(createStore());

    await expect(
      service.updateWorkerRun('019fa268-a999-7777-bef7-d2a43bfc81a6', {
        ownerId: '100000000000003',
        recoveredFromSessionId: SESSION_ID,
        sessionId: SESSION_ID,
        status: 'running',
        workerId: 'offerloop-100000000000003-mac',
      }),
    ).rejects.toThrow('恢复后的新对话 ID 无效');
  });
});
