import {
  ChatService,
  type BatchGetChatsResponse,
  type ChatInfo,
  type SearchChatsParams,
  type SearchChatsResponse,
} from '@lark-apaas/client-toolkit/tools/services';

const chatService = new ChatService();

/**
 * 搜索群组
 */
export async function searchChats(
  params: SearchChatsParams,
): Promise<SearchChatsResponse> {
  return chatService.searchChats(params);
}

/**
 * 批量根据群组 ID 查询群组信息
 */
export async function listChatsByIds(
  chatIds: string[],
): Promise<BatchGetChatsResponse> {
  return chatService.listChatsByIds(chatIds);
}

export type { BatchGetChatsResponse, ChatInfo, SearchChatsParams, SearchChatsResponse };
