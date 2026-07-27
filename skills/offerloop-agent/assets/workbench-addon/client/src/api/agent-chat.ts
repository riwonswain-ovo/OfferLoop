import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

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
  AgentKnowledgeDirectoryResponse,
} from '@shared/agent-chat.interface';

const getStatus = async (): Promise<AgentChatStatusResponse> => {
  try {
    const response = await axiosForBackend({
      method: 'GET',
      url: '/api/agent-chat/status',
    });
    return response.data as AgentChatStatusResponse;
  } catch (error: unknown) {
    logger.error('获取 OfferLoop Agent 状态失败', error);
    throw error;
  }
};

const createRun = async (
  request: AgentChatCreateRunRequest,
): Promise<AgentChatCreateRunResponse> => {
  try {
    const response = await axiosForBackend({
      data: request,
      method: 'POST',
      url: '/api/agent-chat/runs',
    });
    return response.data as AgentChatCreateRunResponse;
  } catch (error: unknown) {
    logger.error('启动 OfferLoop Agent 任务失败', error);
    throw error;
  }
};

const getRun = async (runId: string): Promise<AgentChatRunResponse> => {
  try {
    const response = await axiosForBackend({
      method: 'GET',
      url: `/api/agent-chat/runs/${runId}`,
    });
    return response.data as AgentChatRunResponse;
  } catch (error: unknown) {
    logger.error('获取 OfferLoop Agent 任务状态失败', error);
    throw error;
  }
};

const cancelRun = async (
  runId: string,
): Promise<AgentChatCancelRunResponse> => {
  try {
    const response = await axiosForBackend({
      data: { runId },
      method: 'POST',
      url: '/api/agent-chat/run-cancel',
    });
    return response.data as AgentChatCancelRunResponse;
  } catch (error: unknown) {
    logger.error('停止 OfferLoop Agent 任务失败', error);
    throw error;
  }
};

const createConversation =
  async (): Promise<AgentConversationCreateResponse> => {
    try {
      const response = await axiosForBackend({
        method: 'POST',
        url: '/api/agent-chat/conversations',
      });
      return response.data as AgentConversationCreateResponse;
    } catch (error: unknown) {
      logger.error('新建 OfferLoop Agent 对话失败', error);
      throw error;
    }
  };

const listConversations = async (): Promise<AgentConversationListResponse> => {
  try {
    const response = await axiosForBackend({
      method: 'GET',
      url: '/api/agent-chat/conversations',
    });
    return response.data as AgentConversationListResponse;
  } catch (error: unknown) {
    logger.error('获取 OfferLoop Agent 对话列表失败', error);
    throw error;
  }
};

const getConversation = async (
  sessionId: string,
): Promise<AgentConversationDetailResponse> => {
  try {
    const response = await axiosForBackend({
      method: 'GET',
      url: `/api/agent-chat/conversations/${sessionId}`,
    });
    return response.data as AgentConversationDetailResponse;
  } catch (error: unknown) {
    logger.error('获取 OfferLoop Agent 对话历史失败', error);
    throw error;
  }
};

const archiveConversation = async (
  sessionId: string,
): Promise<AgentConversationArchiveResponse> => {
  try {
    const response = await axiosForBackend({
      method: 'POST',
      url: `/api/agent-chat/conversations/${sessionId}/archive`,
    });
    return response.data as AgentConversationArchiveResponse;
  } catch (error: unknown) {
    logger.error('归档 OfferLoop Agent 对话失败', error);
    throw error;
  }
};

const getKnowledgeDirectory =
  async (): Promise<AgentKnowledgeDirectoryResponse> => {
    const response = await axiosForBackend({
      method: 'GET',
      url: '/api/workbench/wiki-directory',
    });
    return response.data as AgentKnowledgeDirectoryResponse;
  };

export {
  archiveConversation,
  cancelRun,
  createConversation,
  createRun,
  getConversation,
  getKnowledgeDirectory,
  getRun,
  getStatus,
  listConversations,
};
