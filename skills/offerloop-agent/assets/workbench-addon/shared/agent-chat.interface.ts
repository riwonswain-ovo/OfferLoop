export interface OfferLoopSkillSummary {
  key: string;
  title: string;
  description: string;
  requiresConfirmation: boolean;
}

export interface AgentGatewayStatus {
  configured: boolean;
  connected: boolean;
  message: string;
}

export interface AgentChatStatusResponse {
  gateway: AgentGatewayStatus;
  skills: OfferLoopSkillSummary[];
}

export interface AgentSkillRoute {
  key: string;
  title: string;
  reason: string;
}

export interface AgentChatCreateRunRequest {
  message: string;
  sessionId?: string;
  confirmed?: boolean;
}

export type AgentChatCreateRunState =
  | 'answered'
  | 'confirmation_required'
  | 'started';

export interface AgentChatCreateRunResponse {
  state: AgentChatCreateRunState;
  route: AgentSkillRoute;
  confirmationMessage?: string;
  reply?: string;
  runId?: string;
}

export interface AgentConversationCreateResponse {
  state: 'started';
  runId: string;
}

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'cancel_requested'
  | 'cancelled'
  | 'completed'
  | 'failed';

export interface AgentChatRunResponse {
  runId: string;
  status: AgentRunStatus;
  progress: string;
  result?: string;
  error?: string;
  sessionId?: string;
}

export type AgentChatCancelRunState =
  | 'cancel_requested'
  | 'cancelled'
  | 'already_finished';

export interface AgentChatCancelRunRequest {
  runId: string;
}

export interface AgentChatCancelRunResponse {
  state: AgentChatCancelRunState;
}

export type AgentConversationState = 'active' | 'archiving' | 'archived';

export interface AgentConversationSummary {
  sessionId: string;
  title: string;
  route: string;
  state: AgentConversationState;
  messageCount: number;
  updatedAt: string;
}

export interface AgentConversationMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  skillTitle?: string;
  createdAt: string;
}

export interface AgentConversationActiveRun {
  runId: string;
  status: 'queued' | 'running' | 'cancel_requested';
  progress: string;
}

export interface AgentConversationListResponse {
  conversations: AgentConversationSummary[];
}

export interface AgentKnowledgeNode {
  title: string;
}

export interface AgentKnowledgeDirectoryResponse {
  nodes: AgentKnowledgeNode[];
}

export interface AgentConversationDetailResponse {
  conversation: AgentConversationSummary;
  messages: AgentConversationMessage[];
  activeRun?: AgentConversationActiveRun;
}

export type AgentConversationArchiveState = 'already_archived' | 'started';

export interface AgentConversationArchiveResponse {
  state: AgentConversationArchiveState;
  runId?: string;
}

export interface AgentWorkerPollRequest {
  workerId: string;
  ownerId: string;
  displayName: string;
  codexAvailable: boolean;
  version?: string;
}

export interface AgentWorkerTask {
  runId: string;
  message: string;
  route: string;
  confirmed: boolean;
  sessionId?: string;
}

export interface AgentWorkerPollResponse {
  connected: boolean;
  task?: AgentWorkerTask;
}

export type AgentWorkerRunUpdateStatus =
  | 'running'
  | 'cancelled'
  | 'completed'
  | 'failed';

export interface AgentWorkerRunUpdateRequest {
  workerId: string;
  ownerId: string;
  status: AgentWorkerRunUpdateStatus;
  progress?: string;
  result?: string;
  error?: string;
  sessionId?: string;
  recoveredFromSessionId?: string;
}

export interface AgentWorkerRunUpdatePayload extends AgentWorkerRunUpdateRequest {
  runId: string;
}

export interface AgentWorkerRunUpdateResponse {
  accepted: boolean;
  cancelRequested?: boolean;
}
