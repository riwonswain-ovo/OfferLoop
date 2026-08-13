import { useCallback, useEffect, useState } from 'react';

import { getWorkbenchWikiDirectory } from '@client/src/api';
import type {
  WorkbenchWikiDirectoryResponse,
  WorkbenchWikiNode,
} from '@shared/api.interface';

interface WorkbenchWikiState {
  directory: WorkbenchWikiDirectoryResponse | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const findWorkbenchWikiNode = (
  nodes: WorkbenchWikiNode[],
  nodeToken: string | null,
): WorkbenchWikiNode | null => {
  if (!nodeToken) {
    return null;
  }
  for (const node of nodes) {
    if (node.nodeToken === nodeToken) {
      return node;
    }
    const child: WorkbenchWikiNode | null = findWorkbenchWikiNode(
      node.children,
      nodeToken,
    );
    if (child) {
      return child;
    }
  }
  return null;
};

const useWorkbenchWiki = (): WorkbenchWikiState => {
  const [directory, setDirectory] =
    useState<WorkbenchWikiDirectoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const loadDirectory = useCallback(
    async (forceRefresh: boolean): Promise<void> => {
      setLoading(true);
      setError('');
      try {
        const response: WorkbenchWikiDirectoryResponse =
          await getWorkbenchWikiDirectory(forceRefresh);
        setDirectory(response);
      } catch (loadError: unknown) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : '知识库目录暂时无法读取',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadDirectory(false);
  }, [loadDirectory]);

  return {
    directory,
    loading,
    error,
    refresh: async (): Promise<void> => {
      await loadDirectory(true);
    },
  };
};

export { findWorkbenchWikiNode, useWorkbenchWiki };
export type { WorkbenchWikiState };
