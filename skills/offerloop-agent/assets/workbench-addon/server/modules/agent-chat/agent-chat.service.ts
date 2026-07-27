import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import type {
  AgentChatCreateRunRequest,
  AgentChatCreateRunResponse,
  AgentChatCancelRunResponse,
  AgentChatRunResponse,
  AgentChatStatusResponse,
  AgentConversationArchiveResponse,
  AgentConversationCreateResponse,
  AgentConversationDetailResponse,
  AgentConversationListResponse,
  AgentConversationMessage,
  AgentConversationSummary,
  AgentSkillRoute,
  AgentWorkerPollRequest,
  AgentWorkerPollResponse,
  AgentWorkerRunUpdateRequest,
  AgentWorkerRunUpdateResponse,
  OfferLoopSkillSummary,
} from '@shared/agent-chat.interface';

import {
  AGENT_CHAT_STORE,
  type AgentChatStore,
  type RunCancellationResult,
  type RunUpdateResult,
  type StoredConversationRun,
} from './agent-chat.repository';

interface SkillDefinition extends OfferLoopSkillSummary {
  keywords: string[];
}

const OFFERLOOP_SKILLS: SkillDefinition[] = [
  {
    key: 'offerloop-setup',
    title: '首次配置',
    description: '检查、配置和部署 OfferLoop 能力。',
    requiresConfirmation: true,
    keywords: ['安装', '配置', '部署', '环境检查', '第一次使用'],
  },
  {
    key: 'job-collection',
    title: '招聘信息同步',
    description: '筛选招聘信息并维护求职企业清单。',
    requiresConfirmation: true,
    keywords: ['招聘信息', '企业清单', '同步岗位', '收集岗位', '投递清单'],
  },
  {
    key: 'recruiting-reminder',
    title: '笔面试提醒',
    description: '识别招聘邮件并整理笔试、测评和面试安排。',
    requiresConfirmation: true,
    keywords: [
      '招聘邮件',
      '邮件',
      '笔试',
      '笔面试',
      '测评',
      '面试通知',
      '日历',
      '提醒',
    ],
  },
  {
    key: 'offerloop-workspace',
    title: '求职知识库',
    description: '维护必需的飞书求职知识库、三张 Base 和训练产物。',
    requiresConfirmation: true,
    keywords: ['求职知识库', '知识库', '求职进展', '训练产物'],
  },
  {
    key: 'offerloop-workbench',
    title: '飞书工作台',
    description: '按需部署或维护可选的飞书可视化工作台。',
    requiresConfirmation: true,
    keywords: ['求职工作台', '飞书工作台', '妙搭工作台', '可视化工作台'],
  },
  {
    key: 'offerloop-agent',
    title: 'OfferLoop Agent',
    description: '在已有飞书工作台中加装本机 Codex 智能助手右侧栏。',
    requiresConfirmation: true,
    keywords: ['offerloop agent', '智能助手', 'agent 右侧栏', 'codex 右侧栏'],
  },
  {
    key: 'resume-deepthink',
    title: '简历深挖',
    description: '围绕目标岗位深入梳理简历经历与证据。',
    requiresConfirmation: false,
    keywords: ['简历深挖', '项目经历', '简历追问', '经历梳理'],
  },
  {
    key: 'interview-prep',
    title: '面试准备',
    description: '结合简历和岗位 JD 制定面试准备材料。',
    requiresConfirmation: false,
    keywords: ['面试准备', '准备面试', '产品经理面试', '岗位jd', 'jd分析'],
  },
  {
    key: 'mock-lab',
    title: '模拟面试',
    description: '基于简历和目标岗位进行模拟面试与反馈。',
    requiresConfirmation: false,
    keywords: ['模拟面试', '开始面试', '面试官'],
  },
  {
    key: 'talk-review',
    title: '真实面试复盘',
    description: '根据面试录音或 ASR 文本生成复盘。',
    requiresConfirmation: false,
    keywords: ['面试复盘', '复盘录音', 'asr', '面试录音'],
  },
  {
    key: 'pm-sense',
    title: '产品 Sense 训练',
    description: '训练产品设计、策略、商业化和 AI 产品判断。',
    requiresConfirmation: false,
    keywords: ['产品sense', '产品 sense', '产品题', '产品设计题'],
  },
];

const RUN_ID_PATTERN: RegExp = /^[0-9a-f-]{36}$/u;
const SESSION_ID_PATTERN: RegExp = /^[0-9a-f-]{36}$/u;
const WORKER_ID_PATTERN: RegExp = /^[a-zA-Z0-9._-]{3,128}$/u;
const CODEX_ARCHIVE_ROUTE: string = '__codex_archive__';
const CODEX_NEW_THREAD_ROUTE: string = '__codex_new_thread__';
const HEARTBEAT_TTL_MS: number = 35_000;
const RUN_LEASE_MS: number = 15_000;
const INSTANT_GREETING_PATTERN: RegExp =
  /^(?:你好|您好|嗨|哈喽|hello|hi|hey|在吗)(?:[呀啊哦呢嘛么!！。,.，？?~～\s]*)$/iu;
const INSTANT_THANKS_PATTERN: RegExp =
  /^(?:谢谢|感谢|多谢|太感谢(?:你)?了|辛苦了)(?:[呀啊哦呢嘛么!！。,.，？?~～\s]*)$/iu;
const INSTANT_ACK_PATTERN: RegExp =
  /^(?:收到|明白了|知道了|好(?:的|嘞|呀)?|可以|没问题|ok|okay)(?:[呀啊哦呢嘛么!！。,.，？?~～\s]*)$/iu;
const INSTANT_FAREWELL_PATTERN: RegExp =
  /^(?:再见|拜拜|晚安|回头见|bye)(?:[呀啊哦呢嘛么!！。,.，？?~～\s]*)$/iu;
const INSTANT_GREETING_REPLY: string =
  '你好！我是 OfferLoop 智能助手。你可以直接告诉我想整理招聘信息、准备面试、优化简历或进行求职训练。';
const CONTINUATION_PATTERN: RegExp =
  /^(?:继续|接着|然后呢|再来(?:一版|一次|一个)?|详细一点|展开说说|按刚才的|第二个|第三个|换一种|改一下)(?:[吧呀啊哦呢嘛么!！。,.，？?~～\s]*)$/iu;
const GENERAL_CHAT_PATTERN: RegExp =
  /(?:焦虑|迷茫|压力|怎么办|怎么想|怎么看|你觉得|建议|聊聊|为什么|是不是|值不值得)/iu;
const UNCLEAR_ACTION_PATTERN: RegExp =
  /^(?:帮我|请帮我)?(?:弄|搞|处理|看)(?:一下|一弄)?(?:吧)?[!！。,.，？?\s]*$/iu;
const MUTATION_KEYWORDS: string[] = [
  '同步',
  '创建',
  '写入',
  '更新',
  '删除',
  '部署',
  '发送',
  '安排',
  '添加',
];

@Injectable()
export class AgentChatService {
  constructor(
    @Inject(AGENT_CHAT_STORE)
    private readonly repository: AgentChatStore,
  ) {}

  async getStatus(userId: string): Promise<AgentChatStatusResponse> {
    const skills: OfferLoopSkillSummary[] = OFFERLOOP_SKILLS.map(
      (skill: SkillDefinition): OfferLoopSkillSummary => ({
        description: skill.description,
        key: skill.key,
        requiresConfirmation: skill.requiresConfirmation,
        title: skill.title,
      }),
    );
    const cutoff: Date = new Date(Date.now() - HEARTBEAT_TTL_MS);
    const connected: boolean = await this.repository.hasConnectedWorker(
      userId,
      cutoff,
    );

    return {
      gateway: {
        configured: true,
        connected,
        message: connected
          ? '本机 OfferLoop Agent 已连接。'
          : '正在等待本机 OfferLoop Agent 启动。',
      },
      skills,
    };
  }

  async createRun(
    userId: string,
    request: AgentChatCreateRunRequest,
  ): Promise<AgentChatCreateRunResponse> {
    const message: string = request.message?.trim() ?? '';
    if (!message || message.length > 8_000) {
      throw new BadRequestException('请输入 1 到 8000 个字符的消息');
    }

    const instantReply: string | undefined = this.getInstantReply(message);
    if (instantReply) {
      if (request.sessionId) {
        this.assertSessionId(request.sessionId);
        await this.repository.createAnsweredRun(
          {
            confirmed: false,
            message,
            owner: userId,
            route: 'instant',
            sessionId: request.sessionId,
          },
          instantReply,
        );
      }
      return {
        reply: instantReply,
        route: {
          key: 'instant',
          reason: '简单寒暄无需启动完整 Codex Agent。',
          title: '即时回复',
        },
        state: 'answered',
      };
    }

    if (UNCLEAR_ACTION_PATTERN.test(message)) {
      const reply: string =
        '可以。请再告诉我具体想处理什么，例如“检查今天的笔面试邮件”或“继续复盘刚才的面试”。';
      if (request.sessionId) {
        this.assertSessionId(request.sessionId);
        await this.repository.createAnsweredRun(
          {
            confirmed: false,
            message,
            owner: userId,
            route: 'instant',
            sessionId: request.sessionId,
          },
          reply,
        );
      }
      return {
        reply,
        route: {
          key: 'instant',
          reason: '需求信息不足，先澄清再启动 Agent。',
          title: '补充需求',
        },
        state: 'answered',
      };
    }

    const route: AgentSkillRoute = this.routeMessage(
      message,
      Boolean(request.sessionId),
    );
    const skill: SkillDefinition | undefined = OFFERLOOP_SKILLS.find(
      (item: SkillDefinition): boolean => item.key === route.key,
    );
    const needsConfirmation: boolean =
      Boolean(skill?.requiresConfirmation) &&
      (skill?.key === 'recruiting-reminder' || this.hasMutationIntent(message));

    if (needsConfirmation && !request.confirmed) {
      return {
        confirmationMessage:
          `这项操作可能读取私人资料或修改飞书资源。` +
          `确认后将调用「${route.title}」。`,
        route,
        state: 'confirmation_required',
      };
    }

    const cutoff: Date = new Date(Date.now() - HEARTBEAT_TTL_MS);
    const connected: boolean = await this.repository.hasConnectedWorker(
      userId,
      cutoff,
    );
    if (!connected) {
      throw new ServiceUnavailableException('本机 OfferLoop Agent 尚未连接');
    }

    const runId: string = await this.repository.createRun({
      confirmed: Boolean(request.confirmed),
      message,
      owner: userId,
      route: route.key,
      sessionId: request.sessionId,
    });
    if (!runId) {
      throw new ServiceUnavailableException('Agent 任务创建失败');
    }

    return {
      route,
      runId,
      state: 'started',
    };
  }

  async createConversation(
    userId: string,
  ): Promise<AgentConversationCreateResponse> {
    const cutoff: Date = new Date(Date.now() - HEARTBEAT_TTL_MS);
    const connected: boolean = await this.repository.hasConnectedWorker(
      userId,
      cutoff,
    );
    if (!connected) {
      throw new ServiceUnavailableException('本机 OfferLoop Agent 尚未连接');
    }

    const runId: string = await this.repository.createRun({
      confirmed: true,
      message: '新建 OfferLoop 对话',
      owner: userId,
      route: CODEX_NEW_THREAD_ROUTE,
    });
    if (!runId) {
      throw new ServiceUnavailableException('Agent 对话创建失败');
    }
    return { runId, state: 'started' };
  }

  async getRun(userId: string, runId: string): Promise<AgentChatRunResponse> {
    this.assertRunId(runId);
    await this.repository.recoverExpiredRuns(new Date());
    const run: AgentChatRunResponse | undefined = await this.repository.getRun(
      userId,
      runId,
    );
    if (!run) {
      throw new NotFoundException('Agent 任务不存在');
    }
    return run;
  }

  async cancelRun(
    userId: string,
    runId: string,
  ): Promise<AgentChatCancelRunResponse> {
    this.assertRunId(runId);
    await this.repository.recoverExpiredRuns(new Date());
    const result: RunCancellationResult =
      await this.repository.requestRunCancellation(userId, runId);
    if (result === 'not_found') {
      throw new NotFoundException('Agent 任务不存在');
    }
    return { state: result };
  }

  async listConversations(
    userId: string,
  ): Promise<AgentConversationListResponse> {
    await this.repository.recoverExpiredRuns(new Date());
    const runs: StoredConversationRun[] =
      await this.repository.listConversationRuns(userId);
    const grouped: Map<string, StoredConversationRun[]> = new Map();
    for (const run of runs) {
      const current: StoredConversationRun[] = grouped.get(run.sessionId) ?? [];
      current.push(run);
      grouped.set(run.sessionId, current);
    }

    const conversations: AgentConversationSummary[] = [];
    for (const sessionRuns of grouped.values()) {
      const summary: AgentConversationSummary | null =
        this.buildConversationSummary(sessionRuns);
      if (summary) {
        conversations.push(summary);
      }
    }
    conversations.sort(
      (
        left: AgentConversationSummary,
        right: AgentConversationSummary,
      ): number =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
    return { conversations };
  }

  async getConversation(
    userId: string,
    sessionId: string,
  ): Promise<AgentConversationDetailResponse> {
    this.assertSessionId(sessionId);
    await this.repository.recoverExpiredRuns(new Date());
    const runs: StoredConversationRun[] =
      await this.repository.listConversationRunsBySession(userId, sessionId);
    const conversation: AgentConversationSummary | null =
      this.buildConversationSummary(runs);
    if (!conversation) {
      throw new NotFoundException('Agent 对话不存在');
    }

    const ordinaryRuns: StoredConversationRun[] = runs.filter(
      (run: StoredConversationRun): boolean =>
        run.route !== CODEX_ARCHIVE_ROUTE &&
        run.route !== CODEX_NEW_THREAD_ROUTE,
    );
    const messages: AgentConversationMessage[] =
      this.buildConversationMessages(ordinaryRuns);
    const active: StoredConversationRun | undefined = runs.find(
      (run: StoredConversationRun): boolean =>
        run.status === 'queued' ||
        run.status === 'running' ||
        run.status === 'cancel_requested',
    );
    return {
      activeRun: active
        ? {
            progress: active.progress,
            runId: active.id,
            status:
              active.status === 'queued'
                ? 'queued'
                : active.status === 'cancel_requested'
                  ? 'cancel_requested'
                  : 'running',
          }
        : undefined,
      conversation,
      messages,
    };
  }

  async archiveConversation(
    userId: string,
    sessionId: string,
  ): Promise<AgentConversationArchiveResponse> {
    this.assertSessionId(sessionId);
    await this.repository.recoverExpiredRuns(new Date());
    const runs: StoredConversationRun[] =
      await this.repository.listConversationRunsBySession(userId, sessionId);
    const conversation: AgentConversationSummary | null =
      this.buildConversationSummary(runs);
    if (!conversation) {
      throw new NotFoundException('Agent 对话不存在');
    }
    if (conversation.state === 'archived') {
      return { state: 'already_archived' };
    }
    if (conversation.state === 'archiving') {
      const archiveRun: StoredConversationRun | undefined = runs.find(
        (run: StoredConversationRun): boolean =>
          run.route === CODEX_ARCHIVE_ROUTE &&
          (run.status === 'queued' ||
            run.status === 'running' ||
            run.status === 'cancel_requested'),
      );
      return { runId: archiveRun?.id, state: 'started' };
    }
    const hasActiveTurn: boolean = runs.some(
      (run: StoredConversationRun): boolean =>
        run.route !== CODEX_ARCHIVE_ROUTE &&
        (run.status === 'queued' ||
          run.status === 'running' ||
          run.status === 'cancel_requested'),
    );
    if (hasActiveTurn) {
      throw new BadRequestException('请等待当前任务完成后再归档');
    }

    const cutoff: Date = new Date(Date.now() - HEARTBEAT_TTL_MS);
    const connected: boolean = await this.repository.hasConnectedWorker(
      userId,
      cutoff,
    );
    if (!connected) {
      throw new ServiceUnavailableException('本机 OfferLoop Agent 尚未连接');
    }
    const runId: string = await this.repository.createRun({
      confirmed: true,
      message: '归档当前 Codex 对话',
      owner: userId,
      route: CODEX_ARCHIVE_ROUTE,
      sessionId,
    });
    if (!runId) {
      throw new ServiceUnavailableException('归档任务创建失败');
    }
    return { runId, state: 'started' };
  }

  async pollWorker(
    request: AgentWorkerPollRequest,
  ): Promise<AgentWorkerPollResponse> {
    this.assertWorkerRequest(request);
    await this.repository.recoverExpiredRuns(new Date());
    await this.repository.heartbeatWorker(request);
    if (!request.codexAvailable) {
      return { connected: false };
    }

    const leaseExpiresAt: Date = new Date(Date.now() + RUN_LEASE_MS);
    const task = await this.repository.claimNextRun(
      request.ownerId,
      request.workerId,
      leaseExpiresAt,
    );
    return {
      connected: true,
      task,
    };
  }

  async updateWorkerRun(
    runId: string,
    request: AgentWorkerRunUpdateRequest,
  ): Promise<AgentWorkerRunUpdateResponse> {
    this.assertRunId(runId);
    this.assertWorkerId(request.workerId);
    this.assertOwnerId(request.ownerId);
    if (request.status === 'completed' && !request.result?.trim()) {
      throw new BadRequestException('完成的任务必须包含结果');
    }
    if (request.status === 'failed' && !request.error?.trim()) {
      throw new BadRequestException('失败的任务必须包含错误信息');
    }

    const leaseExpiresAt: Date = new Date(Date.now() + RUN_LEASE_MS);
    const updateResult: RunUpdateResult = await this.repository.updateRun(
      request.ownerId,
      runId,
      request,
      leaseExpiresAt,
    );
    if (updateResult === 'missing') {
      throw new NotFoundException('任务不存在或不属于当前 Worker');
    }
    return {
      accepted: updateResult === 'updated',
      cancelRequested: updateResult === 'cancel_requested' || undefined,
    };
  }

  private routeMessage(
    message: string,
    hasActiveConversation: boolean,
  ): AgentSkillRoute {
    const normalizedMessage: string = message.toLowerCase();
    const skill: SkillDefinition | undefined = OFFERLOOP_SKILLS.find(
      (candidate: SkillDefinition): boolean =>
        candidate.keywords.some((keyword: string): boolean =>
          normalizedMessage.includes(keyword.toLowerCase()),
        ),
    );

    if (skill) {
      return {
        key: skill.key,
        reason: `消息与「${skill.title}」的能力范围匹配。`,
        title: skill.title,
      };
    }

    if (hasActiveConversation && CONTINUATION_PATTERN.test(message)) {
      return {
        key: 'continue',
        reason: '这是上一任务的续聊，将沿用当前上下文。',
        title: '继续当前任务',
      };
    }

    if (GENERAL_CHAT_PATTERN.test(message)) {
      return {
        key: 'chat',
        reason: '这是普通求职交流，不需要调用 Skill。',
        title: '求职对话',
      };
    }

    return {
      key: 'auto',
      reason: '将先判断任务意图，再按需选择 OfferLoop Skill。',
      title: '识别任务意图',
    };
  }

  private getInstantReply(message: string): string | undefined {
    if (INSTANT_GREETING_PATTERN.test(message)) {
      return INSTANT_GREETING_REPLY;
    }
    if (INSTANT_THANKS_PATTERN.test(message)) {
      return '不客气！有新的求职任务，随时继续告诉我。';
    }
    if (INSTANT_ACK_PATTERN.test(message)) {
      return '好的，收到。需要继续时直接告诉我。';
    }
    if (INSTANT_FAREWELL_PATTERN.test(message)) {
      return '好的，回头见。祝你求职顺利！';
    }
    return undefined;
  }

  private hasMutationIntent(message: string): boolean {
    return MUTATION_KEYWORDS.some((keyword: string): boolean =>
      message.includes(keyword),
    );
  }

  private assertRunId(runId: string): void {
    if (!RUN_ID_PATTERN.test(runId)) {
      throw new BadRequestException('无效的任务 ID');
    }
  }

  private assertSessionId(sessionId: string): void {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new BadRequestException('无效的对话 ID');
    }
  }

  private assertWorkerRequest(request: AgentWorkerPollRequest): void {
    this.assertWorkerId(request.workerId);
    this.assertOwnerId(request.ownerId);
    const displayName: string = request.displayName?.trim() ?? '';
    if (!displayName || displayName.length > 255) {
      throw new BadRequestException('Worker 名称无效');
    }
    if (request.version && request.version.length > 64) {
      throw new BadRequestException('Worker 版本无效');
    }
  }

  private assertWorkerId(workerId: string): void {
    if (!WORKER_ID_PATTERN.test(workerId ?? '')) {
      throw new BadRequestException('Worker ID 无效');
    }
  }

  private assertOwnerId(ownerId: string): void {
    const normalizedOwnerId: string = ownerId?.trim() ?? '';
    if (!/^[0-9]{1,255}$/u.test(normalizedOwnerId)) {
      throw new BadRequestException('Worker 所属妙搭用户 ID 无效');
    }
  }

  private buildConversationSummary(
    runs: StoredConversationRun[],
  ): AgentConversationSummary | null {
    const ordinaryRuns: StoredConversationRun[] = runs
      .filter(
        (run: StoredConversationRun): boolean =>
          run.route !== CODEX_ARCHIVE_ROUTE &&
          run.route !== CODEX_NEW_THREAD_ROUTE,
      )
      .sort(
        (left: StoredConversationRun, right: StoredConversationRun): number =>
          left.createdAt.getTime() - right.createdAt.getTime(),
      );
    const bootstrapRun: StoredConversationRun | undefined = runs.find(
      (run: StoredConversationRun): boolean =>
        run.route === CODEX_NEW_THREAD_ROUTE,
    );
    const firstRun: StoredConversationRun | undefined =
      ordinaryRuns[0] ?? bootstrapRun;
    if (!firstRun) {
      return null;
    }

    const routeRun: StoredConversationRun | undefined =
      ordinaryRuns.find(
        (run: StoredConversationRun): boolean => run.route !== 'auto',
      ) ?? ordinaryRuns[0];
    const archiveRuns: StoredConversationRun[] = runs.filter(
      (run: StoredConversationRun): boolean =>
        run.route === CODEX_ARCHIVE_ROUTE,
    );
    const archived: boolean = archiveRuns.some(
      (run: StoredConversationRun): boolean => run.status === 'completed',
    );
    const archiving: boolean = archiveRuns.some(
      (run: StoredConversationRun): boolean =>
        run.status === 'queued' ||
        run.status === 'running' ||
        run.status === 'cancel_requested',
    );
    const updatedAt: Date = runs.reduce(
      (latest: Date, run: StoredConversationRun): Date =>
        run.updatedAt.getTime() > latest.getTime() ? run.updatedAt : latest,
      firstRun.updatedAt,
    );
    const messageCount: number = ordinaryRuns.reduce(
      (count: number, run: StoredConversationRun): number =>
        count +
        1 +
        (run.result || run.error || run.status === 'cancelled' ? 1 : 0),
      0,
    );
    const normalizedTitle: string =
      ordinaryRuns[0]?.message.replace(/\s+/gu, ' ').trim() ?? '';
    const title: string = normalizedTitle
      ? normalizedTitle.length > 36
        ? `${normalizedTitle.slice(0, 36)}…`
        : normalizedTitle
      : '新对话';

    return {
      messageCount,
      route: routeRun?.route ?? 'chat',
      sessionId: firstRun.sessionId,
      state: archived ? 'archived' : archiving ? 'archiving' : 'active',
      title,
      updatedAt: updatedAt.toISOString(),
    };
  }

  private buildConversationMessages(
    runs: StoredConversationRun[],
  ): AgentConversationMessage[] {
    const messages: AgentConversationMessage[] = [];
    for (const run of runs) {
      messages.push({
        content: run.message,
        createdAt: run.createdAt.toISOString(),
        id: `${run.id}:user`,
        role: 'user',
      });
      const result: string | undefined = run.result?.trim()
        ? run.result
        : run.error?.trim()
          ? `任务没有完成：${run.error}`
          : run.status === 'cancelled'
            ? '任务已停止。你可以修改提示词后重新发送。'
            : undefined;
      if (!result) {
        continue;
      }
      const skill: SkillDefinition | undefined = OFFERLOOP_SKILLS.find(
        (item: SkillDefinition): boolean => item.key === run.route,
      );
      messages.push({
        content: result,
        createdAt: run.updatedAt.toISOString(),
        id: `${run.id}:assistant`,
        role: 'assistant',
        skillTitle: skill?.title,
      });
    }
    return messages;
  }
}
