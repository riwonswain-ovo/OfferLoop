import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  customTimestamptz,
  userProfile,
} from '../../database/schema';

export const agentWorkerTable = pgTable(
  'agent_worker',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    owner: userProfile('owner').notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('offline'),
    codexAvailable: boolean('codex_available').notNull().default(false),
    version: varchar('version', { length: 64 }),
    lastSeenAt: customTimestamptz('last_seen_at', {
      precision: 3,
    }).notNull(),
    createdAt: customTimestamptz('_created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdBy: userProfile('_created_by').default(sql`CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
    updatedAt: customTimestamptz('_updated_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedBy: userProfile('_updated_by').default(sql`CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  },
  (table) => [
    index('idx_agent_worker_last_seen').on(table.lastSeenAt),
  ],
);

export const agentRunTable = pgTable(
  'agent_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    owner: userProfile('owner').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('queued'),
    message: text('message').notNull(),
    route: varchar('route', { length: 128 }).notNull().default('auto'),
    confirmed: boolean('confirmed').notNull().default(false),
    sessionId: varchar('session_id', { length: 255 }),
    progress: text('progress')
      .notNull()
      .default('等待本机 Agent 领取任务'),
    result: text('result'),
    error: text('error'),
    workerId: varchar('worker_id', { length: 128 }),
    leaseExpiresAt: customTimestamptz('lease_expires_at', { precision: 3 }),
    startedAt: customTimestamptz('started_at', { precision: 3 }),
    completedAt: customTimestamptz('completed_at', { precision: 3 }),
    createdAt: customTimestamptz('_created_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdBy: userProfile('_created_by').default(sql`CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
    updatedAt: customTimestamptz('_updated_at', { precision: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedBy: userProfile('_updated_by').default(sql`CASE
      WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  },
  (table) => [
    index('idx_agent_run_status_created').on(table.status, table.createdAt),
    index('idx_agent_run_owner_created').on(table.createdAt),
  ],
);
