'use client';

import { useQuery, queryOptions, type QueryClient } from '@tanstack/react-query';

import { listChatsByIds, searchChats } from './service';

export const chatQueries = {
  all: () => ['chats'] as const,
  search: (query: string, pageSize: number = 100) =>
    queryOptions({
      queryKey: [...chatQueries.all(), 'search', query, pageSize],
      queryFn: () => searchChats({ query, pageSize }),
      staleTime: 1 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
      enabled: query.length > 0,
    }),
  byIds: (chatIds: string[]) =>
    queryOptions({
      queryKey: [...chatQueries.all(), 'byIds', chatIds.join(',')],
      queryFn: () => listChatsByIds(chatIds),
      staleTime: 1 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
      enabled: chatIds.length > 0,
    }),
};

/**
 * 批量获取群组信息的 hook
 */
export function useChatsByIds(chatIds: string[]) {
  return useQuery(chatQueries.byIds(chatIds));
}

/**
 * 清除群组缓存
 */
export function clearChatCache(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: chatQueries.all() });
}
