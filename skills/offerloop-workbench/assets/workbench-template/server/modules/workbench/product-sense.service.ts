import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { isAxiosError, type AxiosResponse } from 'axios';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';

import type {
  ProductSenseAutoCompleteResponse,
  ProductSenseCompleteResponse,
  ProductSenseDraftInput,
  ProductSenseExternalCompleteInput,
  ProductSenseFeedbackInput,
  ProductSensePreferenceSummary,
  ProductSenseFollowup,
  ProductSenseQuestion,
  ProductSenseSelectInput,
  ProductSenseSession,
  ProductSenseStatus,
} from '@shared/api.interface';
import {
  PM_SENSE_PARENT_NODE_TOKEN,
  PM_SENSE_SPACE_ID,
} from '../../../shared/product-sense-config';

import {
  productSenseDailyQuestion,
  productSenseFeedback,
  productSenseSession,
} from '../../database/schema';
import {
  buildPreferenceSummary,
  classifyCustomReason,
  createPyramidFollowups,
  getQuestion,
  isDislikeReason,
  PRODUCT_SENSE_QUESTIONS,
  selectNextQuestion,
  type ProductSenseFeedbackSnapshot,
} from './product-sense-recommendation';

const FEISHU_API_ROOT = 'https://open.feishu.cn/open-apis';
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;
const MIN_INITIAL_ANSWER_LENGTH = 120;
const MIN_SUMMARY_LENGTH = 100;
const MIN_CUSTOM_REASON_LENGTH = 4;
const MAX_CUSTOM_REASON_LENGTH = 300;
const REQUIRED_AGENT_ARCHIVE_SECTION_GROUPS: string[][] = [
  ['用户原始答案'],
  ['金字塔结构与 MECE 检查'],
  ['完整分析链路'],
  ['1 分钟答案', '1 分钟口语答案'],
  ['3 分钟答案', '3 分钟完整答案'],
];

interface ProductSenseRow {
  id: string;
  owner: string;
  activeQuestionId: string;
  status: string;
  draft: string;
  followupAnswers: unknown;
  selfSummary: string;
  dislikedQuestionIds: unknown;
  completedQuestionIds: unknown;
  archiveNodeToken: string | null;
  archiveUrl: string | null;
  updatedAt: Date;
}

interface ProductSenseFeedbackRow extends ProductSenseFeedbackSnapshot {
  id: string;
  owner: string;
}

interface ProductSenseDailyQuestionRow {
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

interface FeishuEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuErrorEnvelope {
  code?: number;
  msg?: string;
  error?: {
    message?: string;
  };
}

interface FeishuWikiNode {
  node_token: string;
  obj_token: string;
  obj_type?: string;
  space_id?: string;
  title?: string;
  obj_create_time?: string;
  obj_edit_time?: string;
}

interface FeishuWikiNodeData {
  node?: FeishuWikiNode;
}

interface FeishuWikiNodeListData {
  items?: FeishuWikiNode[];
  page_token?: string;
  has_more?: boolean;
}

interface FeishuTextRun {
  text_run: {
    content: string;
  };
}

interface FeishuBlockContent {
  elements: FeishuTextRun[];
}

interface FeishuDocumentBlock {
  block_type: number;
  heading1?: FeishuBlockContent;
  heading2?: FeishuBlockContent;
  text?: FeishuBlockContent;
}

interface FeishuDocumentBlockListData {
  items?: FeishuDocumentBlock[];
}

interface ArchiveResult {
  nodeToken: string;
  objToken: string;
  url: string;
}

interface MarkdownSection {
  title: string;
  paragraphs: string[];
}

@Injectable()
export class ProductSenseService {
  private readonly logger = new Logger(ProductSenseService.name);
  private accessToken = '';
  private accessTokenExpiresAt = 0;
  private accessTokenPromise: Promise<string> | null = null;

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    private readonly httpService: HttpService,
  ) {}

  async getSession(userId: string): Promise<ProductSenseSession> {
    const [row, dailyBatch]: [
      ProductSenseRow,
      ProductSenseDailyQuestionRow[],
    ] = await Promise.all([
      this.getOrCreateRow(userId),
      this.getTodayDailyBatch(userId),
    ]);
    const feedback: ProductSenseFeedbackRow[] =
      this.toStringArray(row.dislikedQuestionIds).length > 0
        ? await this.getFeedback(userId)
        : [];
    return this.toSession(row, feedback, dailyBatch);
  }

  async saveDraft(
    userId: string,
    input: ProductSenseDraftInput,
  ): Promise<ProductSenseSession> {
    if (!['answering', 'coaching'].includes(input.status)) {
      throw new BadRequestException('未知的训练阶段');
    }
    const row: ProductSenseRow = await this.getOrCreateRow(userId);
    if (row.status === 'archiving') {
      throw new BadRequestException('回答正在归档，请稍候');
    }
    await this.db
      .update(productSenseSession)
      .set({
        draft: input.draft,
        followupAnswers: input.followupAnswers,
        selfSummary: input.selfSummary,
        status: input.status,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(productSenseSession.id, row.id));
    return this.getSession(userId);
  }

  async selectQuestion(
    userId: string,
    input: ProductSenseSelectInput,
  ): Promise<ProductSenseSession> {
    const row: ProductSenseRow = await this.getOrCreateRow(userId);
    if (row.status !== 'recommended' || row.draft.trim()) {
      throw new BadRequestException('当前题目已经锁定，不能重新选择');
    }
    const questionId: string = String(input?.questionId ?? '').trim();
    const dailyBatch: ProductSenseDailyQuestionRow[] =
      await this.getTodayDailyBatch(userId);
    const selected: ProductSenseDailyQuestionRow | undefined =
      dailyBatch.find(
        (question: ProductSenseDailyQuestionRow): boolean =>
          question.questionId === questionId
          && question.status === 'available',
      );
    if (!selected) {
      const builtInQuestion: ProductSenseQuestion | undefined =
        dailyBatch.length === 0
          ? PRODUCT_SENSE_QUESTIONS.find(
            (question: ProductSenseQuestion): boolean =>
              question.id === questionId,
          )
          : undefined;
      if (builtInQuestion) {
        await this.db
          .update(productSenseSession)
          .set({
            activeQuestionId: builtInQuestion.id,
            status: 'recommended',
            updatedAt: new Date(),
            updatedBy: userId,
          })
          .where(eq(productSenseSession.id, row.id));
        return this.getSession(userId);
      }
      throw new BadRequestException('这道题已不可选择，请刷新今日题单');
    }
    await this.db
      .update(productSenseDailyQuestion)
      .set({
        status: 'selected',
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(productSenseDailyQuestion.id, selected.id));
    await this.db
      .update(productSenseSession)
      .set({
        activeQuestionId: selected.questionId,
        status: 'recommended',
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(productSenseSession.id, row.id));
    return this.getSession(userId);
  }

  async switchQuestion(
    userId: string,
    input: ProductSenseFeedbackInput,
  ): Promise<ProductSenseSession> {
    const reason: string = String(input?.reason ?? '');
    if (!isDislikeReason(String(reason))) {
      throw new BadRequestException('未知的不喜欢原因');
    }
    const reasonDetail: string = String(input?.detail ?? '').trim();
    if (
      reason === '其他原因'
      && reasonDetail.length < MIN_CUSTOM_REASON_LENGTH
    ) {
      throw new BadRequestException('请具体说明原因，至少填写 4 个字');
    }
    if (reasonDetail.length > MAX_CUSTOM_REASON_LENGTH) {
      throw new BadRequestException('具体原因请控制在 300 字以内');
    }
    const inferredReason: string | null = reason === '其他原因'
      ? classifyCustomReason(reasonDetail) ?? null
      : null;
    const row: ProductSenseRow = await this.getOrCreateRow(userId);
    const targetQuestionId: string =
      String(input?.questionId ?? row.activeQuestionId).trim();
    const isActiveQuestion: boolean = targetQuestionId === row.activeQuestionId;
    if (row.status === 'archiving') {
      throw new BadRequestException('回答正在归档，请稍候');
    }
    if (row.status !== 'recommended' && !isActiveQuestion) {
      throw new BadRequestException('训练中的题目只能放弃当前题');
    }
    const question: ProductSenseQuestion =
      await this.getQuestionForUser(userId, targetQuestionId);
    const feedback: ProductSenseFeedbackRow[] =
      await this.getFeedback(userId);
    const newFeedback: ProductSenseFeedbackSnapshot = {
      questionId: question.id,
      company: question.company,
      sector: question.sector,
      logicType: question.logicType,
      scopeType: question.scopeType,
      knowledgeLevel: question.knowledgeLevel,
      reason,
      reasonDetail: reason === '其他原因' ? reasonDetail : null,
      inferredReason,
    };
    await this.db.insert(productSenseFeedback).values({
      owner: userId,
      questionId: question.id,
      questionPrompt: question.prompt,
      company: question.company,
      sector: question.sector,
      logicType: question.logicType,
      scopeType: question.scopeType,
      knowledgeLevel: question.knowledgeLevel,
      reason,
      factAnchor: question.factAnchor,
      sourceUrl: question.sourceUrl,
      reasonDetail: reason === '其他原因' ? reasonDetail : null,
      inferredReason,
      createdBy: userId,
      updatedBy: userId,
    });
    const dislikedIds: string[] = this.toStringArray(
      row.dislikedQuestionIds,
    );
    const completedIds: string[] = this.toStringArray(
      row.completedQuestionIds,
    );
    const dailyBatch: ProductSenseDailyQuestionRow[] =
      await this.getTodayDailyBatch(userId);
    const targetDaily: ProductSenseDailyQuestionRow | undefined =
      dailyBatch.find(
        (item: ProductSenseDailyQuestionRow): boolean =>
          item.questionId === targetQuestionId,
      );
    if (targetDaily) {
      const canDislikeSelectedQuestion: boolean =
        targetDaily.status === 'selected' && isActiveQuestion;
      if (
        targetDaily.status !== 'available'
        && !canDislikeSelectedQuestion
      ) {
        throw new BadRequestException('这道题已不能更换，请刷新今日题单');
      }
      await this.db
        .update(productSenseDailyQuestion)
        .set({
          status: 'disliked',
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(productSenseDailyQuestion.id, targetDaily.id));
    }
    const nextDaily: ProductSenseDailyQuestionRow | undefined =
      dailyBatch.find(
        (item: ProductSenseDailyQuestionRow): boolean =>
          item.questionId !== targetQuestionId
          && item.status === 'available',
      );
    const nextQuestion: ProductSenseQuestion = nextDaily
      ? this.toDailyQuestion(nextDaily)
      : selectNextQuestion(
        targetQuestionId,
        completedIds,
        [...dislikedIds, targetQuestionId],
        [...feedback, newFeedback],
      );
    const reasonMarker: string = `${targetQuestionId}:${reason}`;
    await this.db
      .update(productSenseSession)
      .set({
        activeQuestionId: nextQuestion.id,
        status: 'recommended',
        draft: '',
        followupAnswers: {},
        selfSummary: '',
        dislikedQuestionIds: [...dislikedIds, reasonMarker],
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(productSenseSession.id, row.id));
    return this.getSession(userId);
  }

  async complete(
    userId: string,
  ): Promise<ProductSenseCompleteResponse> {
    const row: ProductSenseRow = await this.getOrCreateRow(userId);
    const question: ProductSenseQuestion =
      await this.getQuestionForUser(userId, row.activeQuestionId);
    const followupAnswers: { [questionId: string]: string } =
      this.toAnswerMap(row.followupAnswers);
    this.validateCompleteAnswer(row, question, followupAnswers);

    await this.db
      .update(productSenseSession)
      .set({
        status: 'archiving',
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(productSenseSession.id, row.id));

    let archive: ArchiveResult;
    try {
      archive = await this.archiveAnswer(row, question, followupAnswers);
    } catch (error: unknown) {
      await this.db
        .update(productSenseSession)
        .set({
          status: 'coaching',
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(productSenseSession.id, row.id));
      const message: string = this.getFeishuErrorMessage(
        error,
        '飞书知识库归档失败',
      );
      this.logger.error(message, error instanceof Error ? error.stack : '');
      throw new ServiceUnavailableException(
        `回答已保留，但暂未完成知识库归档：${message}`,
      );
    }

    return this.finishQuestion(userId, row, question, archive);
  }

  async completeExternal(
    userId: string,
    input: ProductSenseExternalCompleteInput,
  ): Promise<ProductSenseCompleteResponse> {
    const row: ProductSenseRow = await this.getOrCreateRow(userId);
    if (row.status !== 'answering' && row.status !== 'coaching') {
      throw new BadRequestException('请先从工作台开始这道题的 Agent 训练');
    }
    const question: ProductSenseQuestion =
      await this.getQuestionForUser(userId, row.activeQuestionId);
    const nodeToken: string = this.parseWikiNodeToken(input?.archiveUrl);
    const archive: ArchiveResult = await this.verifyExternalArchive(
      nodeToken,
      question,
    );
    return this.finishQuestion(userId, row, question, archive);
  }

  async completeAutomatically(
    userId: string,
  ): Promise<ProductSenseAutoCompleteResponse> {
    const row: ProductSenseRow = await this.getOrCreateRow(userId);
    const session: ProductSenseSession = await this.getSession(userId);
    if (row.status === 'recommended') {
      return { completed: false, session };
    }
    if (row.status !== 'answering' && row.status !== 'coaching') {
      return {
        completed: false,
        session,
        message: '当前训练状态暂时不能自动验收',
      };
    }
    const question: ProductSenseQuestion =
      await this.getQuestionForUser(userId, row.activeQuestionId);
    const candidate: FeishuWikiNode | undefined =
      await this.findAgentArchive(
        question,
        row.archiveNodeToken,
        row.updatedAt,
      );
    if (!candidate) {
      return {
        completed: false,
        session,
        message: '等待 Agent 完成飞书知识库归档',
      };
    }
    let archive: ArchiveResult;
    try {
      archive = await this.verifyExternalArchive(
        candidate.node_token,
        question,
      );
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return {
          completed: false,
          session,
          message: '已发现本题文档，等待 Agent 写入完整训练章节',
        };
      }
      throw error;
    }
    const completion: ProductSenseCompleteResponse =
      await this.finishQuestion(userId, row, question, archive);
    return {
      completed: true,
      session: completion.session,
      archiveUrl: completion.archiveUrl,
    };
  }

  private async findAgentArchive(
    question: ProductSenseQuestion,
    previousNodeToken: string | null,
    trainingStartedAt: Date,
  ): Promise<FeishuWikiNode | undefined> {
    const token: string = await this.getAccessToken();
    const nodes: FeishuWikiNode[] = [];
    let pageToken: string | undefined;
    let pageCount: number = 0;
    do {
      const response: AxiosResponse<
        FeishuEnvelope<FeishuWikiNodeListData>
      > = await firstValueFrom(
        this.httpService.get(
          `${FEISHU_API_ROOT}/wiki/v2/spaces/`
          + `${PM_SENSE_SPACE_ID}/nodes`,
          {
            params: {
              page_size: 50,
              parent_node_token: PM_SENSE_PARENT_NODE_TOKEN,
              ...(pageToken ? { page_token: pageToken } : {}),
            },
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
          },
        ),
      );
      const data: FeishuWikiNodeListData = this.unwrap(
        response.data,
        '查找 Agent 训练文档',
      );
      nodes.push(...(data.items ?? []));
      pageToken = data.has_more && data.page_token
        ? data.page_token
        : undefined;
      pageCount += 1;
    } while (pageToken && pageCount < 20);

    return nodes
      .filter((node: FeishuWikiNode): boolean => {
        const title: string = String(node.title ?? '');
        const createdAtMs: number =
          Number(node.obj_create_time ?? 0) * 1000;
        const matchesCurrentRun: boolean =
          title.includes(question.id)
          || createdAtMs >= trainingStartedAt.getTime() - 60_000;
        return node.obj_type === 'docx'
          && node.node_token !== previousNodeToken
          && title.includes(question.company)
          && matchesCurrentRun
          && /(?:产品\s*Sense|PM\s*Sense)/iu.test(title);
      })
      .sort(
        (left: FeishuWikiNode, right: FeishuWikiNode): number =>
          Number(right.obj_edit_time ?? 0)
          - Number(left.obj_edit_time ?? 0),
      )[0];
  }

  private async finishQuestion(
    userId: string,
    row: ProductSenseRow,
    question: ProductSenseQuestion,
    archive: ArchiveResult,
  ): Promise<ProductSenseCompleteResponse> {
    const completedIds: string[] = this.toStringArray(
      row.completedQuestionIds,
    );
    const nextCompletedIds: string[] = Array.from(
      new Set<string>([...completedIds, question.id]),
    );
    const feedback: ProductSenseFeedbackRow[] =
      await this.getFeedback(userId);
    const dailyBatch: ProductSenseDailyQuestionRow[] =
      await this.getTodayDailyBatch(userId);
    const completedDaily: ProductSenseDailyQuestionRow | undefined =
      dailyBatch.find(
        (item: ProductSenseDailyQuestionRow): boolean =>
          item.questionId === question.id,
      );
    if (completedDaily) {
      await this.db
        .update(productSenseDailyQuestion)
        .set({
          status: 'completed',
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(productSenseDailyQuestion.id, completedDaily.id));
    }
    const nextDaily: ProductSenseDailyQuestionRow | undefined =
      dailyBatch.find(
        (item: ProductSenseDailyQuestionRow): boolean =>
          item.questionId !== question.id
          && item.status === 'available',
      );
    const nextQuestion: ProductSenseQuestion = nextDaily
      ? this.toDailyQuestion(nextDaily)
      : selectNextQuestion(
        question.id,
        nextCompletedIds,
        [],
        feedback,
      );
    await this.db
      .update(productSenseSession)
      .set({
        activeQuestionId: nextQuestion.id,
        status: 'recommended',
        draft: '',
        followupAnswers: {},
        selfSummary: '',
        completedQuestionIds: nextCompletedIds,
        dislikedQuestionIds: [],
        archiveNodeToken: archive.nodeToken,
        archiveObjToken: archive.objToken,
        archiveUrl: archive.url,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(productSenseSession.id, row.id));

    return {
      session: await this.getSession(userId),
      archiveUrl: archive.url,
    };
  }

  private parseWikiNodeToken(archiveUrl: string | undefined): string {
    const rawUrl: string = String(archiveUrl ?? '').trim();
    if (!rawUrl) {
      throw new BadRequestException('请粘贴 Agent 生成的飞书知识库链接');
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new BadRequestException('请输入完整的飞书知识库链接');
    }
    const match: RegExpMatchArray | null = parsedUrl.pathname.match(
      /^\/wiki\/([A-Za-z0-9_-]+)\/?$/u,
    );
    if (parsedUrl.protocol !== 'https:' || !match?.[1]) {
      throw new BadRequestException(
        '链接应为 https://.../wiki/<文档标识>',
      );
    }
    return match[1];
  }

  private async verifyExternalArchive(
    nodeToken: string,
    question: ProductSenseQuestion,
  ): Promise<ArchiveResult> {
    const token: string = await this.getAccessToken();
    const nodeResponse: AxiosResponse<
      FeishuEnvelope<FeishuWikiNodeData>
    > = await firstValueFrom(
      this.httpService.get(
        `${FEISHU_API_ROOT}/wiki/v2/spaces/get_node`,
        {
          params: { token: nodeToken },
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    );
    const node: FeishuWikiNode | undefined =
      this.unwrap(nodeResponse.data, '读取 Agent 训练文档').node;
    if (!node?.node_token || !node.obj_token) {
      throw new BadRequestException('飞书未返回有效的知识库文档信息');
    }
    if (node.obj_type !== 'docx') {
      throw new BadRequestException('训练产物必须是飞书新版文档');
    }
    if (node.space_id !== PM_SENSE_SPACE_ID) {
      throw new BadRequestException(
        '该文档不在 OfferLoop 产品 Sense 知识空间中',
      );
    }
    const title: string = String(node.title ?? '');
    const hasExpectedTitle: boolean =
      title.includes(question.company)
      && /(?:产品\s*Sense|PM\s*Sense)/iu.test(title);
    if (!hasExpectedTitle) {
      throw new BadRequestException(
        `文档标题需包含“${question.company}”和“产品 Sense”`,
      );
    }

    const content: string = await this.readDocumentText(
      token,
      node.obj_token,
    );
    const missingSections: string[] =
      REQUIRED_AGENT_ARCHIVE_SECTION_GROUPS
        .filter(
          (alternatives: string[]): boolean =>
            !alternatives.some(
              (section: string): boolean => content.includes(section),
            ),
        )
        .map((alternatives: string[]): string => alternatives[0]);
    if (missingSections.length > 0) {
      throw new BadRequestException(
        `训练文档尚不完整，缺少：${missingSections.join('、')}`,
      );
    }
    return {
      nodeToken: node.node_token,
      objToken: node.obj_token,
      url: `https://my.feishu.cn/wiki/${node.node_token}`,
    };
  }

  private async readDocumentText(
    token: string,
    documentId: string,
  ): Promise<string> {
    const response: AxiosResponse<
      FeishuEnvelope<FeishuDocumentBlockListData>
    > = await firstValueFrom(
      this.httpService.get(
        `${FEISHU_API_ROOT}/docx/v1/documents/${documentId}/blocks`,
        {
          params: { page_size: 500 },
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    );
    const items: FeishuDocumentBlock[] =
      this.unwrap(response.data, '检查 Agent 训练文档').items ?? [];
    return items
      .flatMap((block: FeishuDocumentBlock): FeishuTextRun[] => [
        ...(block.heading1?.elements ?? []),
        ...(block.heading2?.elements ?? []),
        ...(block.text?.elements ?? []),
      ])
      .map((element: FeishuTextRun): string =>
        String(element.text_run?.content ?? ''))
      .join('\n');
  }

  private async getOrCreateRow(userId: string): Promise<ProductSenseRow> {
    if (!userId) {
      throw new BadRequestException('请先登录工作台');
    }
    const rows: ProductSenseRow[] = await this.db
      .select()
      .from(productSenseSession)
      .where(eq(productSenseSession.owner, userId)) as ProductSenseRow[];
    if (rows[0]) {
      return rows[0];
    }
    try {
      const created: ProductSenseRow[] = await this.db
        .insert(productSenseSession)
        .values({
          owner: userId,
          activeQuestionId: PRODUCT_SENSE_QUESTIONS[0].id,
          status: 'recommended',
          draft: '',
          followupAnswers: {},
          selfSummary: '',
          dislikedQuestionIds: [],
          completedQuestionIds: [],
          createdBy: userId,
          updatedBy: userId,
        })
        .returning() as ProductSenseRow[];
      if (created[0]) {
        return created[0];
      }
    } catch (error: unknown) {
      this.logger.warn(
        `创建训练状态发生并发冲突，将重新读取：${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
    const retried: ProductSenseRow[] = await this.db
      .select()
      .from(productSenseSession)
      .where(eq(productSenseSession.owner, userId)) as ProductSenseRow[];
    if (!retried[0]) {
      throw new ServiceUnavailableException('无法初始化产品 Sense 训练');
    }
    return retried[0];
  }

  private async getTodayDailyBatch(
    userId: string,
  ): Promise<ProductSenseDailyQuestionRow[]> {
    const rows: ProductSenseDailyQuestionRow[] = await this.db
      .select()
      .from(productSenseDailyQuestion)
      .where(and(
        eq(productSenseDailyQuestion.owner, userId),
        eq(productSenseDailyQuestion.questionDate, this.getTodayLabel()),
      )) as ProductSenseDailyQuestionRow[];
    const latestBatchNo: number = rows.reduce(
      (maximum: number, row: ProductSenseDailyQuestionRow): number =>
        Math.max(maximum, Number(row.batchNo)),
      0,
    );
    return rows
      .filter(
        (row: ProductSenseDailyQuestionRow): boolean =>
          Number(row.batchNo) === latestBatchNo,
      )
      .sort(
        (
          left: ProductSenseDailyQuestionRow,
          right: ProductSenseDailyQuestionRow,
        ): number => Number(left.position) - Number(right.position),
      );
  }

  private async getQuestionForUser(
    userId: string,
    questionId: string,
  ): Promise<ProductSenseQuestion> {
    const rows: ProductSenseDailyQuestionRow[] = await this.db
      .select()
      .from(productSenseDailyQuestion)
      .where(and(
        eq(productSenseDailyQuestion.owner, userId),
        eq(productSenseDailyQuestion.questionId, questionId),
      )) as ProductSenseDailyQuestionRow[];
    return rows[0] ? this.toDailyQuestion(rows[0]) : getQuestion(questionId);
  }

  private getTodayLabel(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private toDailyQuestion(
    row: ProductSenseDailyQuestionRow,
  ): ProductSenseQuestion {
    return {
      id: row.questionId,
      company: row.company,
      prompt: row.prompt,
      logicType:
        row.logicType as ProductSenseQuestion['logicType'],
      sector: row.sector,
      scopeType:
        row.scopeType as ProductSenseQuestion['scopeType'],
      knowledgeLevel:
        row.knowledgeLevel as ProductSenseQuestion['knowledgeLevel'],
      factAnchor: row.factAnchor,
      sourceLabel: row.sourceLabel,
      sourceUrl: row.sourceUrl,
      followups: createPyramidFollowups(
        row.groupingPrompt,
        row.mecePrompt,
      ),
    };
  }

  private async toSession(
    row: ProductSenseRow,
    feedback: ProductSenseFeedbackRow[],
    dailyBatch: ProductSenseDailyQuestionRow[],
  ): Promise<ProductSenseSession> {
    const draft: string = row.draft ?? '';
    const followupAnswers: { [questionId: string]: string } =
      this.toAnswerMap(row.followupAnswers);
    const selfSummary: string = row.selfSummary ?? '';
    const status: ProductSenseStatus = this.toStatus(row.status);
    const visibleDailyRows: ProductSenseDailyQuestionRow[] =
      dailyBatch.filter(
        (item: ProductSenseDailyQuestionRow): boolean =>
          item.status === 'available' || item.status === 'selected',
      );
    const persistedDailyQuestions: ProductSenseQuestion[] =
      visibleDailyRows.map(
        (item: ProductSenseDailyQuestionRow): ProductSenseQuestion =>
          this.toDailyQuestion(item),
      );
    const fallbackQuestion: ProductSenseQuestion =
      getQuestion(row.activeQuestionId);
    const dailyQuestions: ProductSenseQuestion[] =
      dailyBatch.length === 0
        ? [
          fallbackQuestion,
          ...PRODUCT_SENSE_QUESTIONS.filter(
            (item: ProductSenseQuestion): boolean =>
              item.id !== fallbackQuestion.id,
          ),
        ].slice(0, 3)
        : persistedDailyQuestions;
    const activeDailyRow: ProductSenseDailyQuestionRow | undefined =
      dailyBatch.find(
        (item: ProductSenseDailyQuestionRow): boolean =>
          item.questionId === row.activeQuestionId,
      );
    const question: ProductSenseQuestion = activeDailyRow
      ? this.toDailyQuestion(activeDailyRow)
      : status === 'recommended' && dailyQuestions[0]
        ? dailyQuestions[0]
        : fallbackQuestion;
    const completedIds: string[] = this.toStringArray(
      row.completedQuestionIds,
    );
    const preference: ProductSensePreferenceSummary =
      buildPreferenceSummary(feedback);
    const queuedDaily: ProductSenseQuestion | undefined =
      dailyQuestions.find(
        (item: ProductSenseQuestion): boolean =>
          item.id !== question.id,
      );
    return {
      question,
      queuedQuestion: queuedDaily ?? selectNextQuestion(
          question.id,
          completedIds,
          this.toStringArray(row.dislikedQuestionIds),
          feedback,
        ),
      dailyQuestions,
      dailyDate: this.getTodayLabel(),
      canRegenerate: dailyBatch.length > 0
        && dailyBatch.every(
          (item: ProductSenseDailyQuestionRow): boolean =>
            item.status === 'disliked',
        ),
      status,
      draft,
      followupAnswers,
      selfSummary,
      completedCount: completedIds.length,
      poolSize: dailyBatch.length || PRODUCT_SENSE_QUESTIONS.length,
      canSwitch: !draft.trim() && status === 'recommended',
      progress: this.calculateProgress(
        status,
        draft,
        question,
        followupAnswers,
        selfSummary,
      ),
      preference,
      lastArchiveUrl: row.archiveNodeToken
        ? `https://my.feishu.cn/wiki/${row.archiveNodeToken}`
        : row.archiveUrl ?? undefined,
    };
  }

  private calculateProgress(
    status: ProductSenseStatus,
    draft: string,
    question: ProductSenseQuestion,
    answers: { [questionId: string]: string },
    selfSummary: string,
  ): number {
    if (status === 'archiving') {
      return 95;
    }
    let completedSteps = draft.trim().length >= MIN_INITIAL_ANSWER_LENGTH
      ? 1
      : 0;
    completedSteps += question.followups.filter(
      (followup: ProductSenseFollowup): boolean =>
        String(answers[followup.id] ?? '').trim().length
        >= followup.minLength,
    ).length;
    if (selfSummary.trim().length >= MIN_SUMMARY_LENGTH) {
      completedSteps += 1;
    }
    return Math.round(
      (completedSteps / (question.followups.length + 2)) * 100,
    );
  }

  private validateCompleteAnswer(
    row: ProductSenseRow,
    question: ProductSenseQuestion,
    answers: { [questionId: string]: string },
  ): void {
    if (row.draft.trim().length < MIN_INITIAL_ANSWER_LENGTH) {
      throw new BadRequestException('请先完成不少于 120 字的独立初答');
    }
    const missingFollowup: ProductSenseFollowup | undefined =
      question.followups.find(
        (followup: ProductSenseFollowup): boolean =>
          String(answers[followup.id] ?? '').trim().length
          < followup.minLength,
      );
    if (missingFollowup) {
      throw new BadRequestException(
        `请先完成“${missingFollowup.title}”，不少于 `
        + `${missingFollowup.minLength} 字`,
      );
    }
    if (row.selfSummary.trim().length < MIN_SUMMARY_LENGTH) {
      throw new BadRequestException(
        `请先完成不少于 ${MIN_SUMMARY_LENGTH} 字的自主总结`,
      );
    }
  }

  private async getFeedback(
    userId: string,
  ): Promise<ProductSenseFeedbackRow[]> {
    return await this.db
      .select()
      .from(productSenseFeedback)
      .where(
        eq(productSenseFeedback.owner, userId),
      ) as ProductSenseFeedbackRow[];
  }

  private toStatus(value: string): ProductSenseStatus {
    if (
      value === 'answering'
      || value === 'coaching'
      || value === 'archiving'
    ) {
      return value;
    }
    return 'recommended';
  }

  private toAnswerMap(value: unknown): { [questionId: string]: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const result: { [questionId: string]: string } = {};
    Object.entries(value).forEach(
      ([key, answer]: [string, unknown]): void => {
        if (typeof answer === 'string') {
          result[key] = answer;
        }
      },
    );
    return result;
  }

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item: unknown): item is string =>
        typeof item === 'string')
      : [];
  }

  private async archiveAnswer(
    row: ProductSenseRow,
    question: ProductSenseQuestion,
    followupAnswers: { [questionId: string]: string },
  ): Promise<ArchiveResult> {
    const runId: string = randomUUID();
    const dateLabel: string = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()).replaceAll('/', '-');
    const title: string =
      `${dateLabel}｜${question.company}｜产品 Sense 训练`;
    const token: string = await this.getAccessToken();
    const createResponse: AxiosResponse<
      FeishuEnvelope<FeishuWikiNodeData>
    > = await firstValueFrom(
      this.httpService.post(
        `${FEISHU_API_ROOT}/wiki/v2/spaces/${PM_SENSE_SPACE_ID}/nodes`,
        {
          node_type: 'origin',
          obj_type: 'docx',
          parent_node_token: PM_SENSE_PARENT_NODE_TOKEN,
          title,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    );
    const node: FeishuWikiNode | undefined =
      this.unwrap(createResponse.data, '创建知识库文档').node;
    if (!node?.node_token || !node.obj_token) {
      throw new ServiceUnavailableException('飞书未返回知识库文档标识');
    }
    const sections: MarkdownSection[] = this.buildMarkdownSections(
      runId,
      question,
      row,
      followupAnswers,
    );
    await this.writeDocument(token, node.obj_token, sections);
    return {
      nodeToken: node.node_token,
      objToken: node.obj_token,
      url: `https://my.feishu.cn/wiki/${node.node_token}`,
    };
  }

  private buildMarkdownSections(
    runId: string,
    question: ProductSenseQuestion,
    row: ProductSenseRow,
    followupAnswers: { [questionId: string]: string },
  ): MarkdownSection[] {
    const followupParagraphs: string[] = question.followups.flatMap(
      (followup: ProductSenseFollowup): string[] => [
        `${followup.title}：${followup.prompt}`,
        `回答：${String(followupAnswers[followup.id] ?? '').trim()}`,
      ],
    );
    const answerByStage = (
      stage: ProductSenseFollowup['stage'],
    ): string => {
      const followup: ProductSenseFollowup | undefined =
        question.followups.find(
          (item: ProductSenseFollowup): boolean =>
            item.stage === stage,
        );
      return followup
        ? String(followupAnswers[followup.id] ?? '').trim()
        : '';
    };
    const atomizedAnswer: string = answerByStage('atomize');
    const groupedAnswer: string = answerByStage('group');
    const meceAnswer: string = answerByStage('mece');
    return [
      {
        title: '产物信息',
        paragraphs: [
          '状态：complete',
          `run_id：${runId}`,
          `训练类型：${question.logicType}`,
          `生成时间：${new Date().toISOString()}`,
        ],
      },
      {
        title: '题目与能力标签',
        paragraphs: [
          question.prompt,
          `公司：${question.company}`,
          `能力标签：${question.logicType}、业务判断、利益权衡`,
        ],
      },
      {
        title: '用户原始答案',
        paragraphs: [row.draft.trim()],
      },
      {
        title: '讨论过程与暴露问题',
        paragraphs: followupParagraphs,
      },
      {
        title: '已确认判断',
        paragraphs: [row.selfSummary.trim()],
      },
      {
        title: '外部研究证据',
        paragraphs: [
          `事实锚点：${question.factAnchor}`,
          `来源：${question.sourceLabel} ${question.sourceUrl}`,
          '说明：来源用于核实题目事实，不代表来源支持用户的全部判断。',
        ],
      },
      {
        title: '金字塔结构与 MECE 检查',
        paragraphs: [
          `总判断：${row.selfSummary.trim()}`,
          `原子判断：${atomizedAnswer}`,
          `第二层分组：${groupedAnswer}`,
          `MECE、边界与证伪：${meceAnswer}`,
        ],
      },
      {
        title: '完整分析链路',
        paragraphs: [
          `初答：${row.draft.trim()}`,
          `拆成原子判断：${atomizedAnswer}`,
          `自下而上归组：${groupedAnswer}`,
          `MECE 与证伪检查：${meceAnswer}`,
          `自上而下总结：${row.selfSummary.trim()}`,
        ],
      },
      {
        title: '反方观点、边界与失败风险',
        paragraphs: [meceAnswer],
      },
      {
        title: '推荐方案与指标',
        paragraphs: [
          row.selfSummary.trim(),
          `验证重点：${meceAnswer}`,
        ],
      },
      {
        title: '1 分钟答案',
        paragraphs: [row.selfSummary.trim()],
      },
      {
        title: '3 分钟答案',
        paragraphs: [
          row.selfSummary.trim(),
          `论证结构：${groupedAnswer}`,
          `边界与证伪：${meceAnswer}`,
        ],
      },
      {
        title: '可能追问',
        paragraphs: question.followups.map(
          (followup: ProductSenseFollowup): string => followup.prompt,
        ),
      },
      {
        title: '可迁移方法',
        paragraphs: [
          '思考时自下而上：拆成原子判断，按一个标准归组，'
          + '检查重复、混层、断链与关键缺口，再提炼总判断。',
          '表达时自上而下：结论先行，展开同层理由，'
          + '最后补事实、机制、边界与验证。',
        ],
      },
      {
        title: '后续训练',
        paragraphs: [
          '选择另一家互联网公司中的相似决策，检验当前判断能否迁移。',
        ],
      },
    ];
  }

  private async writeDocument(
    token: string,
    documentId: string,
    sections: MarkdownSection[],
  ): Promise<void> {
    const children: FeishuDocumentBlock[] = [
      ...sections.flatMap(
        (section: MarkdownSection): FeishuDocumentBlock[] => [
          this.createHeadingBlock(2, section.title),
          ...section.paragraphs
            .filter((paragraph: string): boolean => Boolean(paragraph.trim()))
            .map(
              (paragraph: string): FeishuDocumentBlock =>
                this.createTextBlock(paragraph),
            ),
        ],
      ),
    ];
    const response: AxiosResponse<FeishuEnvelope<object>> =
      await firstValueFrom(
        this.httpService.post(
          `${FEISHU_API_ROOT}/docx/v1/documents/${documentId}`
          + `/blocks/${documentId}/children?document_revision_id=-1`,
          { children },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
          },
        ),
      );
    this.unwrap(response.data, '写入知识库文档');
  }

  private createHeadingBlock(
    level: 1 | 2,
    content: string,
  ): FeishuDocumentBlock {
    const blockContent: FeishuBlockContent = {
      elements: [{ text_run: { content } }],
    };
    return level === 1
      ? { block_type: 3, heading1: blockContent }
      : { block_type: 4, heading2: blockContent };
  }

  private createTextBlock(content: string): FeishuDocumentBlock {
    return {
      block_type: 2,
      text: {
        elements: [{ text_run: { content } }],
      },
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }
    if (this.accessTokenPromise) {
      return this.accessTokenPromise;
    }
    this.accessTokenPromise = this.loadAccessToken();
    try {
      return await this.accessTokenPromise;
    } finally {
      this.accessTokenPromise = null;
    }
  }

  private async loadAccessToken(): Promise<string> {
    const appId: string = this.requireEnv('FEISHU_APP_ID');
    const appSecret: string = this.requireEnv('FEISHU_APP_SECRET');
    const response: AxiosResponse<FeishuEnvelope<object>> =
      await firstValueFrom(
        this.httpService.post(
          `${FEISHU_API_ROOT}/auth/v3/tenant_access_token/internal`,
          {
            app_id: appId,
            app_secret: appSecret,
          },
        ),
      );
    if (response.data.code !== 0 || !response.data.tenant_access_token) {
      throw new ServiceUnavailableException(
        `飞书应用认证失败：${response.data.msg ?? 'unknown error'}`,
      );
    }
    const expiresInSeconds: number = Number(response.data.expire ?? 7200);
    this.accessToken = response.data.tenant_access_token;
    this.accessTokenExpiresAt =
      Date.now()
      + Math.max(
        60_000,
        expiresInSeconds * 1000 - TOKEN_SAFETY_WINDOW_MS,
      );
    return this.accessToken;
  }

  private unwrap<T>(envelope: FeishuEnvelope<T>, action: string): T {
    if (envelope.code !== 0 || !envelope.data) {
      throw new ServiceUnavailableException(
        `${action}失败：${envelope.msg ?? `code ${envelope.code}`}`,
      );
    }
    return envelope.data;
  }

  private getFeishuErrorMessage(
    error: unknown,
    fallback: string,
  ): string {
    if (isAxiosError<FeishuErrorEnvelope>(error)) {
      const responseData: FeishuErrorEnvelope | undefined =
        error.response?.data;
      const detail: string =
        String(responseData?.msg ?? responseData?.error?.message ?? '').trim();
      if (detail) {
        const codeLabel: string = responseData?.code === undefined
          ? ''
          : `（code ${responseData.code}）`;
        return `飞书接口返回${codeLabel}：${detail}`;
      }
    }
    return error instanceof Error && error.message
      ? error.message
      : fallback;
  }

  private requireEnv(name: string): string {
    const value: string = String(process.env[name] ?? '').trim();
    if (!value) {
      throw new ServiceUnavailableException(`工作台缺少环境变量：${name}`);
    }
    return value;
  }
}
