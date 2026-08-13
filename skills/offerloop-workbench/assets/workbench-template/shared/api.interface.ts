export type BaseCellValue =
  | string
  | number
  | boolean
  | null
  | BaseCellValue[]
  | { [key: string]: BaseCellValue };

export type WorkbenchDatasetSource = 'companies' | 'progress' | 'events';

export interface WorkbenchRecord {
  recordId: string;
  fields: { [key: string]: BaseCellValue };
}

export interface WorkbenchDataset {
  records: WorkbenchRecord[];
  total: number;
  hasMore: boolean;
  nextPageToken?: string;
  pageSize: number;
  sourceUrl: string;
}

export interface WorkbenchViewMeta {
  viewId: string;
  viewName: string;
  viewType: string;
}

export interface WorkbenchTableMeta {
  tableId: string;
  tableName: string;
  views: WorkbenchViewMeta[];
}

export interface WorkbenchDatasetQuery {
  source: WorkbenchDatasetSource;
  tableId?: string;
  viewId?: string;
  pageToken?: string;
  pageSize?: number;
  searchText?: string;
  filters?: { [fieldName: string]: string };
}

export interface WorkbenchCalendarEvent {
  eventId: string;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  url?: string;
}

export interface WorkbenchCalendarResponse {
  connected: boolean;
  events: WorkbenchCalendarEvent[];
  authorizationUrl?: string;
  message?: string;
}

export interface WorkbenchWikiNode {
  nodeToken: string;
  objectToken: string;
  objectType: string;
  title: string;
  hasChildren: boolean;
  wikiUrl: string;
  documentUrl?: string;
  children: WorkbenchWikiNode[];
}

export interface WorkbenchWikiDirectoryResponse {
  spaceId: string;
  spaceName: string;
  generatedAt: string;
  nodes: WorkbenchWikiNode[];
}

export interface WorkbenchWikiDocumentPreviewResponse {
  title: string;
  content: string;
  sourceUrl: string;
  generatedAt: string;
}

export interface WorkbenchWikiComponentAuth {
  openId: string;
  signature: string;
  appId: string;
  timestamp: number;
  nonceStr: string;
  url: string;
  jsApiList: string[];
}

export interface WorkbenchWikiComponentAuthResponse {
  connected: boolean;
  authorizationUrl?: string;
  auth?: WorkbenchWikiComponentAuth;
  message?: string;
}

export interface KnowledgeDigestSummary {
  recordId: string;
  title: string;
  sourceName: string;
  sourceType: string;
  publishedAt?: string;
  conclusion: string;
  keyPoints: string[];
  value: string;
  boundary: string;
  tags: string[];
  sourceUrl?: string;
  documentUrl?: string;
  status: string;
}

export interface KnowledgeDigestSource {
  recordId: string;
  name: string;
  mode: string;
  type: string;
  interests: string[];
  enabled: boolean;
  lastSyncedAt?: string;
  status: string;
  message: string;
  totalItems: number;
  completedItems: number;
  nextBatch: string;
  targetDate?: string;
  planUrl?: string;
}

export interface KnowledgeDigestResponse {
  configured: boolean;
  generatedAt: string;
  summaries: KnowledgeDigestSummary[];
  sources: KnowledgeDigestSource[];
  baseUrl?: string;
  message?: string;
}

export interface WorkbenchResponse {
  generatedAt: string;
  calendarSourceUrl: string;
  companies: WorkbenchDataset;
  companyViews: WorkbenchViewMeta[];
  progress: WorkbenchDataset;
  progressViews: WorkbenchViewMeta[];
  events: WorkbenchDataset;
  eventTables: WorkbenchTableMeta[];
}

export interface WorkbenchStageCount {
  stage: string;
  count: number;
}

export interface WorkbenchApplicationsResponse {
  generatedAt: string;
  calendarSourceUrl: string;
  progress: WorkbenchDataset;
  progressView: WorkbenchViewMeta;
  stageCounts: WorkbenchStageCount[];
  upcomingEvents: WorkbenchDataset;
}

export interface WorkbenchInterviewsResponse {
  generatedAt: string;
  events: WorkbenchDataset;
  eventTable: WorkbenchTableMeta;
  eventView: WorkbenchViewMeta;
  offerCount: number;
}

export interface WorkbenchHomeResponse {
  generatedAt: string;
  opportunityCount: number;
  stageCounts: WorkbenchStageCount[];
  upcomingEvents: WorkbenchDataset;
  calendarSourceUrl: string;
  dailyCheckin: {
    status: 'enabled' | 'paused' | 'disabled' | 'unverified';
    sendTime: '21:30';
    timezone: 'Asia/Shanghai';
    pauseReason?: string;
  };
}

export interface WorkbenchHomeStageCountsResponse {
  generatedAt: string;
  stageCounts: WorkbenchStageCount[];
}

export type ProductSenseLogicType =
  | '商业逻辑'
  | '产品逻辑'
  | '业务逻辑'
  | '方法论逻辑';

export type ProductSenseStatus =
  | 'recommended'
  | 'answering'
  | 'coaching'
  | 'archiving';

export type ProductSenseDislikeReason =
  | '范围太大'
  | '前提模糊'
  | '不感兴趣'
  | '过于熟悉'
  | '依赖行业知识'
  | '其他原因';

export type ProductSenseQuestionScope = '具体功能' | '具体业务' | '整体应用';

export type ProductSenseKnowledgeLevel = '大众认知' | '行业认知';

export type ProductSenseCoachingStage = 'atomize' | 'group' | 'mece';

export interface ProductSenseFollowup {
  id: string;
  stage: ProductSenseCoachingStage;
  title: string;
  prompt: string;
  helper: string;
  minLength: number;
}

export interface ProductSenseQuestion {
  id: string;
  company: string;
  prompt: string;
  logicType: ProductSenseLogicType;
  sector: string;
  scopeType: ProductSenseQuestionScope;
  knowledgeLevel: ProductSenseKnowledgeLevel;
  factAnchor: string;
  sourceLabel: string;
  sourceUrl: string;
  followups: ProductSenseFollowup[];
}

export interface ProductSensePreferenceSummary {
  feedbackCount: number;
  learnedSignals: string[];
}

export interface ProductSenseFeedbackInput {
  questionId?: string;
  reason: ProductSenseDislikeReason;
  detail?: string;
}

export interface ProductSenseSelectInput {
  questionId: string;
}

export interface ProductSenseSession {
  question: ProductSenseQuestion;
  queuedQuestion: ProductSenseQuestion;
  dailyQuestions: ProductSenseQuestion[];
  dailyDate: string;
  canRegenerate: boolean;
  status: ProductSenseStatus;
  draft: string;
  followupAnswers: { [questionId: string]: string };
  selfSummary: string;
  completedCount: number;
  poolSize: number;
  canSwitch: boolean;
  progress: number;
  preference: ProductSensePreferenceSummary;
  lastArchiveUrl?: string;
}

export interface ProductSenseDraftInput {
  draft: string;
  followupAnswers: { [questionId: string]: string };
  selfSummary: string;
  status: 'answering' | 'coaching';
}

export interface ProductSenseCompleteResponse {
  session: ProductSenseSession;
  archiveUrl: string;
}

export interface ProductSenseAutoCompleteResponse {
  completed: boolean;
  session: ProductSenseSession;
  archiveUrl?: string;
  message?: string;
}

export interface ProductSenseExternalCompleteInput {
  archiveUrl: string;
}
