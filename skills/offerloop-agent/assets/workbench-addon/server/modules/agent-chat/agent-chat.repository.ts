import { Inject, Injectable } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, desc, eq, gt, isNotNull, lt } from 'drizzle-orm';

import type {
  AgentChatRunResponse,
  AgentWorkerPollRequest,
  AgentWorkerRunUpdateRequest,
  AgentWorkerTask,
} from '@shared/agent-chat.interface';

import { agentRunTable, agentWorkerTable } from './agent-chat.schema';
import { CODEX_ARCHIVE_ROUTE } from './agent-chat.constants';

export interface CreateStoredRunInput {
  owner: string;
  message: string;
  route: string;
  confirmed: boolean;
  sessionId?: string;
}

export interface StoredConversationRun {
  id: string;
  status: string;
  message: string;
  route: string;
  sessionId: string;
  progress: string;
  result?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type RunUpdateResult =
  | 'updated'
  | 'cancel_requested'
  | 'finished'
  | 'missing';
export type RunCancellationResult =
  | 'cancel_requested'
  | 'cancelled'
  | 'already_finished'
  | 'not_found';

export interface AgentChatStore {
  hasConnectedWorker(owner: string, cutoff: Date): Promise<boolean>;
  recoverExpiredRuns(now: Date): Promise<void>;
  createRun(input: CreateStoredRunInput): Promise<string>;
  createAnsweredRun(
    input: CreateStoredRunInput,
    result: string,
  ): Promise<string>;
  getRun(
    owner: string,
    runId: string,
  ): Promise<AgentChatRunResponse | undefined>;
  listConversationRuns(owner: string): Promise<StoredConversationRun[]>;
  listConversationRunsBySession(
    owner: string,
    sessionId: string,
  ): Promise<StoredConversationRun[]>;
  heartbeatWorker(request: AgentWorkerPollRequest): Promise<void>;
  claimNextRun(
    owner: string,
    workerId: string,
    leaseExpiresAt: Date,
  ): Promise<AgentWorkerTask | undefined>;
  requestRunCancellation(
    owner: string,
    runId: string,
  ): Promise<RunCancellationResult>;
  updateRun(
    owner: string,
    runId: string,
    request: AgentWorkerRunUpdateRequest,
    leaseExpiresAt: Date,
  ): Promise<RunUpdateResult>;
  markConversationRecovered(
    owner: string,
    sessionId: string,
  ): Promise<void>;
}

export const AGENT_CHAT_STORE: unique symbol = Symbol('AGENT_CHAT_STORE');
const CANCELLATION_GRACE_MS: number = 8_000;

@Injectable()
export class AgentChatRepository implements AgentChatStore {
  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
  ) {}

  async hasConnectedWorker(owner: string, cutoff: Date): Promise<boolean> {
    const workers: Array<{ id: string }> = await this.db
      .select({ id: agentWorkerTable.id })
      .from(agentWorkerTable)
      .where(
        and(
          eq(agentWorkerTable.owner, owner),
          eq(agentWorkerTable.status, 'online'),
          eq(agentWorkerTable.codexAvailable, true),
          gt(agentWorkerTable.lastSeenAt, cutoff),
        ),
      )
      .limit(1);
    return workers.length > 0;
  }

  async recoverExpiredRuns(now: Date): Promise<void> {
    await this.db
      .update(agentRunTable)
      .set({
        completedAt: now,
        error: '本机 Agent 连接中断，请重新发送任务',
        leaseExpiresAt: null,
        progress: '任务已中断',
        status: 'failed',
        updatedAt: now,
      })
      .where(
        and(
          eq(agentRunTable.status, 'running'),
          lt(agentRunTable.leaseExpiresAt, now),
        ),
      );
    await this.db
      .update(agentRunTable)
      .set({
        completedAt: now,
        leaseExpiresAt: null,
        progress: '任务已停止',
        result: '任务已停止。',
        status: 'cancelled',
        updatedAt: now,
      })
      .where(
        and(
          eq(agentRunTable.status, 'cancel_requested'),
          lt(
            agentRunTable.updatedAt,
            new Date(now.getTime() - CANCELLATION_GRACE_MS),
          ),
        ),
      );
  }

  async createRun(input: CreateStoredRunInput): Promise<string> {
    const rows: Array<{ id: string }> = await this.db
      .insert(agentRunTable)
      .values({
        confirmed: input.confirmed,
        message: input.message,
        owner: input.owner,
        progress: '等待本机 Agent 领取任务',
        route: input.route,
        sessionId: input.sessionId,
        status: 'queued',
      })
      .returning({ id: agentRunTable.id });
    return rows[0]?.id ?? '';
  }

  async createAnsweredRun(
    input: CreateStoredRunInput,
    result: string,
  ): Promise<string> {
    const now: Date = new Date();
    const rows: Array<{ id: string }> = await this.db
      .insert(agentRunTable)
      .values({
        completedAt: now,
        confirmed: input.confirmed,
        message: input.message,
        owner: input.owner,
        progress: '已即时回复',
        result,
        route: input.route,
        sessionId: input.sessionId,
        status: 'completed',
      })
      .returning({ id: agentRunTable.id });
    return rows[0]?.id ?? '';
  }

  async getRun(
    owner: string,
    runId: string,
  ): Promise<AgentChatRunResponse | undefined> {
    const rows: Array<typeof agentRunTable.$inferSelect> = await this.db
      .select()
      .from(agentRunTable)
      .where(and(eq(agentRunTable.id, runId), eq(agentRunTable.owner, owner)))
      .limit(1);
    const row: typeof agentRunTable.$inferSelect | undefined = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      error: row.error ?? undefined,
      progress: row.progress,
      result: row.result ?? undefined,
      runId: row.id,
      sessionId: row.sessionId ?? undefined,
      status: this.normalizeRunStatus(row.status),
    };
  }

  async listConversationRuns(owner: string): Promise<StoredConversationRun[]> {
    const rows: Array<typeof agentRunTable.$inferSelect> = await this.db
      .select()
      .from(agentRunTable)
      .where(
        and(eq(agentRunTable.owner, owner), isNotNull(agentRunTable.sessionId)),
      )
      .orderBy(desc(agentRunTable.updatedAt))
      .limit(500);
    return this.toConversationRuns(rows);
  }

  async listConversationRunsBySession(
    owner: string,
    sessionId: string,
  ): Promise<StoredConversationRun[]> {
    const rows: Array<typeof agentRunTable.$inferSelect> = await this.db
      .select()
      .from(agentRunTable)
      .where(
        and(
          eq(agentRunTable.owner, owner),
          eq(agentRunTable.sessionId, sessionId),
        ),
      )
      .orderBy(asc(agentRunTable.createdAt))
      .limit(200);
    return this.toConversationRuns(rows);
  }

  async heartbeatWorker(request: AgentWorkerPollRequest): Promise<void> {
    const now: Date = new Date();
    await this.db
      .insert(agentWorkerTable)
      .values({
        codexAvailable: request.codexAvailable,
        displayName: request.displayName,
        id: request.workerId,
        lastSeenAt: now,
        owner: request.ownerId,
        status: request.codexAvailable ? 'online' : 'degraded',
        version: request.version,
      })
      .onConflictDoNothing();
    const rows: Array<{ id: string }> = await this.db
      .update(agentWorkerTable)
      .set({
        codexAvailable: request.codexAvailable,
        displayName: request.displayName,
        lastSeenAt: now,
        status: request.codexAvailable ? 'online' : 'degraded',
        updatedAt: now,
        version: request.version,
      })
      .where(
        and(
          eq(agentWorkerTable.id, request.workerId),
          eq(agentWorkerTable.owner, request.ownerId),
        ),
      )
      .returning({ id: agentWorkerTable.id });
    if (rows.length !== 1) {
      throw new Error('Worker ID 已绑定到其他飞书用户');
    }
  }

  async claimNextRun(
    owner: string,
    workerId: string,
    leaseExpiresAt: Date,
  ): Promise<AgentWorkerTask | undefined> {
    const queuedRows: Array<typeof agentRunTable.$inferSelect> = await this.db
      .select()
      .from(agentRunTable)
      .where(
        and(
          eq(agentRunTable.owner, owner),
          eq(agentRunTable.status, 'queued'),
        ),
      )
      .orderBy(asc(agentRunTable.createdAt))
      .limit(1);
    const queued: typeof agentRunTable.$inferSelect | undefined = queuedRows[0];
    if (!queued) {
      return undefined;
    }

    const now: Date = new Date();
    const claimedRows: Array<typeof agentRunTable.$inferSelect> = await this.db
      .update(agentRunTable)
      .set({
        leaseExpiresAt,
        progress: '本机 Agent 已领取任务',
        startedAt: now,
        status: 'running',
        updatedAt: now,
        workerId,
      })
      .where(
        and(
          eq(agentRunTable.id, queued.id),
          eq(agentRunTable.owner, owner),
          eq(agentRunTable.status, 'queued'),
        ),
      )
      .returning();
    const claimed: typeof agentRunTable.$inferSelect | undefined =
      claimedRows[0];
    if (!claimed) {
      return undefined;
    }

    return {
      confirmed: claimed.confirmed,
      message: claimed.message,
      route: claimed.route,
      runId: claimed.id,
      sessionId: claimed.sessionId ?? undefined,
    };
  }

  async requestRunCancellation(
    owner: string,
    runId: string,
  ): Promise<RunCancellationResult> {
    const rows: Array<typeof agentRunTable.$inferSelect> = await this.db
      .select()
      .from(agentRunTable)
      .where(and(eq(agentRunTable.id, runId), eq(agentRunTable.owner, owner)))
      .limit(1);
    const run: typeof agentRunTable.$inferSelect | undefined = rows[0];
    if (!run) {
      return 'not_found';
    }
    if (run.status === 'cancel_requested') {
      return 'cancel_requested';
    }
    if (run.status !== 'queued' && run.status !== 'running') {
      return 'already_finished';
    }

    const now: Date = new Date();
    if (run.status === 'queued') {
      const cancelledRows: Array<{ id: string }> = await this.db
        .update(agentRunTable)
        .set({
          completedAt: now,
          progress: '任务已停止',
          status: 'cancelled',
          updatedAt: now,
        })
        .where(
          and(
            eq(agentRunTable.id, runId),
            eq(agentRunTable.owner, owner),
            eq(agentRunTable.status, 'queued'),
          ),
        )
        .returning({ id: agentRunTable.id });
      if (cancelledRows.length === 1) {
        return 'cancelled';
      }
      return this.requestRunCancellation(owner, runId);
    }

    const requestedRows: Array<{ id: string }> = await this.db
      .update(agentRunTable)
      .set({
        leaseExpiresAt: new Date(now.getTime() + CANCELLATION_GRACE_MS),
        progress: '正在停止任务',
        status: 'cancel_requested',
        updatedAt: now,
      })
      .where(
        and(
          eq(agentRunTable.id, runId),
          eq(agentRunTable.owner, owner),
          eq(agentRunTable.status, 'running'),
        ),
      )
      .returning({ id: agentRunTable.id });
    return requestedRows.length === 1 ? 'cancel_requested' : 'already_finished';
  }

  async updateRun(
    owner: string,
    runId: string,
    request: AgentWorkerRunUpdateRequest,
    leaseExpiresAt: Date,
  ): Promise<RunUpdateResult> {
    const currentRows: Array<{ status: string }> = await this.db
      .select({ status: agentRunTable.status })
      .from(agentRunTable)
      .where(
        and(
          eq(agentRunTable.id, runId),
          eq(agentRunTable.owner, owner),
          eq(agentRunTable.workerId, request.workerId),
        ),
      )
      .limit(1);
    const current: { status: string } | undefined = currentRows[0];
    if (!current) {
      return 'missing';
    }
    if (
      current.status === 'cancel_requested' &&
      request.status !== 'cancelled'
    ) {
      return 'cancel_requested';
    }
    if (
      current.status === 'cancelled' ||
      current.status === 'completed' ||
      current.status === 'failed'
    ) {
      return 'finished';
    }

    const now: Date = new Date();
    const completed: boolean =
      request.status === 'completed' ||
      request.status === 'failed' ||
      request.status === 'cancelled';
    const rows: Array<{ id: string }> = await this.db
      .update(agentRunTable)
      .set({
        completedAt: completed ? now : undefined,
        error: request.error,
        leaseExpiresAt: completed ? null : leaseExpiresAt,
        progress: request.progress,
        result: request.result,
        sessionId: request.sessionId,
        status: request.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentRunTable.id, runId),
          eq(agentRunTable.owner, owner),
          eq(agentRunTable.workerId, request.workerId),
        ),
      )
      .returning({ id: agentRunTable.id });
    return rows.length === 1 ? 'updated' : 'missing';
  }

  async markConversationRecovered(
    owner: string,
    sessionId: string,
  ): Promise<void> {
    const existingRows: Array<{ id: string }> = await this.db
      .select({ id: agentRunTable.id })
      .from(agentRunTable)
      .where(
        and(
          eq(agentRunTable.owner, owner),
          eq(agentRunTable.sessionId, sessionId),
          eq(agentRunTable.route, CODEX_ARCHIVE_ROUTE),
          eq(agentRunTable.status, 'completed'),
        ),
      )
      .limit(1);
    if (existingRows.length > 0) {
      return;
    }

    const now: Date = new Date();
    await this.db.insert(agentRunTable).values({
      completedAt: now,
      confirmed: true,
      message: 'Codex 对话已在外部归档',
      owner,
      progress: '已归档',
      result: '旧对话已归档，后续消息已自动迁移到新的 Codex 对话。',
      route: CODEX_ARCHIVE_ROUTE,
      sessionId,
      status: 'completed',
      updatedAt: now,
    });
  }

  private normalizeRunStatus(status: string): AgentChatRunResponse['status'] {
    if (
      status === 'queued' ||
      status === 'running' ||
      status === 'cancel_requested' ||
      status === 'cancelled' ||
      status === 'completed' ||
      status === 'failed'
    ) {
      return status;
    }
    return 'failed';
  }

  private toConversationRuns(
    rows: Array<typeof agentRunTable.$inferSelect>,
  ): StoredConversationRun[] {
    const runs: StoredConversationRun[] = [];
    for (const row of rows) {
      if (!row.sessionId) {
        continue;
      }
      runs.push({
        createdAt: row.createdAt,
        error: row.error ?? undefined,
        id: row.id,
        message: row.message,
        progress: row.progress,
        result: row.result ?? undefined,
        route: row.route,
        sessionId: row.sessionId,
        status: row.status,
        updatedAt: row.updatedAt,
      });
    }
    return runs;
  }
}
