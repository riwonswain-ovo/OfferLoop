/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const productSenseDailyQuestion = pgTable("product_sense_daily_question", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: userProfile("owner").notNull(),
  questionDate: varchar("question_date", { length: 10 }).notNull(),
  batchNo: integer("batch_no").notNull().default(1),
  position: integer("position").notNull(),
  questionId: varchar("question_id", { length: 160 }).notNull().unique(),
  company: varchar("company", { length: 100 }).notNull(),
  prompt: text("prompt").notNull(),
  logicType: varchar("logic_type", { length: 32 }).notNull(),
  sector: varchar("sector", { length: 100 }).notNull(),
  scopeType: varchar("scope_type", { length: 32 }).notNull(),
  knowledgeLevel: varchar("knowledge_level", { length: 32 }).notNull(),
  factAnchor: text("fact_anchor").notNull(),
  sourceLabel: varchar("source_label", { length: 100 }).notNull(),
  sourceUrl: text("source_url").notNull(),
  groupingPrompt: text("grouping_prompt").notNull(),
  mecePrompt: text("mece_prompt").notNull(),
  status: varchar("status", { length: 32 }).notNull().default('available'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_product_sense_daily_question_slot").on(table.questionDate, table.batchNo, table.position),
  uniqueIndex("uk_product_sense_daily_question_id").on(table.questionId),
  index("idx_product_sense_daily_question_owner_date").on(table.questionDate, table.batchNo),
]);

export const productSenseFeedback = pgTable("product_sense_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: userProfile("owner").notNull(),
  questionId: varchar("question_id", { length: 100 }).notNull(),
  questionPrompt: text("question_prompt").notNull(),
  company: varchar("company", { length: 100 }).notNull(),
  sector: varchar("sector", { length: 100 }).notNull(),
  logicType: varchar("logic_type", { length: 32 }).notNull(),
  scopeType: varchar("scope_type", { length: 32 }).notNull(),
  knowledgeLevel: varchar("knowledge_level", { length: 32 }).notNull(),
  reason: varchar("reason", { length: 32 }).notNull(),
  factAnchor: text("fact_anchor").notNull(),
  sourceUrl: text("source_url").notNull(),
  reasonDetail: text("reason_detail"),
  inferredReason: varchar("inferred_reason", { length: 32 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_product_sense_feedback_owner_created").on(table.createdAt),
  index("idx_product_sense_feedback_question").on(table.questionId),
  index("idx_product_sense_feedback_reason").on(table.reason),
]);

export const productSenseSession = pgTable("product_sense_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: userProfile("owner").notNull(),
  activeQuestionId: varchar("active_question_id", { length: 100 }).notNull().default('feature-retirement'),
  status: varchar("status", { length: 32 }).notNull().default('recommended'),
  draft: text("draft").notNull(),
  /**
   * @type { [questionId: string]: string }
   */
  followupAnswers: jsonb("followup_answers").notNull().default('{}'),
  selfSummary: text("self_summary").notNull(),
  /**
   * @type string[]
   */
  dislikedQuestionIds: jsonb("disliked_question_ids").notNull().default('[]'),
  /**
   * @type string[]
   */
  completedQuestionIds: jsonb("completed_question_ids").notNull().default('[]'),
  archiveNodeToken: varchar("archive_node_token", { length: 255 }),
  archiveObjToken: varchar("archive_obj_token", { length: 255 }),
  archiveUrl: text("archive_url"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  // Complex index: CREATE UNIQUE INDEX uk_product_sense_session_owner ON product_sense_session USING btree (((owner).user_id)),
  index("idx_product_sense_session_status").on(table.status),
]);

// table aliases
export const productSenseDailyQuestionTable = productSenseDailyQuestion;
export const productSenseFeedbackTable = productSenseFeedback;
export const productSenseSessionTable = productSenseSession;
