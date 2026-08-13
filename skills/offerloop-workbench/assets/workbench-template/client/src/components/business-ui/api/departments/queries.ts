'use client';

import { useQuery, queryOptions, type QueryClient } from '@tanstack/react-query';

import { searchDepartments } from './service';

export const departmentQueries = {
  all: () => ['departments'] as const,
  search: (query: string, pageSize: number = 100) =>
    queryOptions({
      queryKey: [...departmentQueries.all(), 'search', query, pageSize],
      queryFn: () => searchDepartments({ query, pageSize }),
      staleTime: 1 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
      enabled: query.length > 0,
    }),
};

export type UseSearchDepartmentsOptions = {
  query: string;
  pageSize?: number;
  enabled?: boolean;
};

/**
 * 搜索部门的 hook
 */
export function useSearchDepartments(options: UseSearchDepartmentsOptions) {
  const { query, pageSize = 100, enabled = true } = options;

  return useQuery({
    ...departmentQueries.search(query, pageSize),
    enabled: enabled && query.length > 0,
  });
}

/**
 * 清除部门缓存
 */
export function clearDepartmentCache(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: departmentQueries.all() });
}
