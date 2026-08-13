import React, { useEffect, useState } from 'react';
import {
  useLocation,
  useSearchParams,
} from 'react-router-dom';

import { Skeleton } from '@client/src/components/ui/skeleton';
import { cn } from '@client/src/lib/utils';
import type { WorkbenchWikiNode } from '@shared/api.interface';

import { WorkbenchHomeOverview } from './WorkbenchHomeOverview';
import { WorkbenchApplicationsPage } from './WorkbenchApplicationsPage';
import { WorkbenchInterviewsPage } from './WorkbenchInterviewsPage';
import { WorkbenchMaterialsPage } from './WorkbenchMaterialsPage';
import { WorkbenchProductSensePage } from './WorkbenchProductSensePage';
import {
  WORKBENCH_NAV_ITEMS,
  WorkbenchTopNav,
  type WorkbenchPageId,
} from './WorkbenchTopNav';
import { findWorkbenchWikiNode, useWorkbenchWiki } from './useWorkbenchWiki';
import { WorkbenchWikiSidebar } from './WorkbenchWikiSidebar';
import { getWorkbenchOAuthRecoveryRoute } from './workbench-oauth';

const SIDEBAR_STORAGE_KEY = 'offerloop-wiki-sidebar-open';

interface WorkbenchWikiDocumentProps {
  node: WorkbenchWikiNode;
  onBack: () => void;
}

const getInitialSidebarState = (): boolean => {
  if (!window.matchMedia('(min-width: 768px)').matches) {
    return false;
  }
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false';
};

const isWorkbenchPageId = (value: string | null): value is WorkbenchPageId =>
  WORKBENCH_NAV_ITEMS.some((item) => item.id === value);

const WorkbenchPage: React.FC = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedNodeToken: string | null = searchParams.get('document');
  const activePage: WorkbenchPageId = isWorkbenchPageId(
    searchParams.get('page'),
  )
    ? searchParams.get('page') as WorkbenchPageId
    : 'home';
  const wiki = useWorkbenchWiki();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    getInitialSidebarState,
  );
  const [WorkbenchWikiDocument, setWorkbenchWikiDocument] =
    useState<React.ComponentType<WorkbenchWikiDocumentProps> | null>(null);
  const selectedWikiNode: WorkbenchWikiNode | null = findWorkbenchWikiNode(
    wiki.directory?.nodes ?? [],
    selectedNodeToken,
  );
  const recoveringOAuthDocumentRoute: boolean = Boolean(
    selectedNodeToken
    && location.pathname.endsWith('/calendar-oauth-callback'),
  );
  useEffect(() => {
    if (!recoveringOAuthDocumentRoute) {
      return;
    }
    window.location.replace(
      getWorkbenchOAuthRecoveryRoute(location.pathname, location.search),
    );
  }, [
    location.pathname,
    location.search,
    recoveringOAuthDocumentRoute,
  ]);
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    if (!selectedWikiNode || WorkbenchWikiDocument) {
      return;
    }
    let cancelled = false;
    void import('./WorkbenchWikiDocument').then((module): void => {
      if (!cancelled) {
        setWorkbenchWikiDocument(
          (): React.ComponentType<WorkbenchWikiDocumentProps> =>
            module.WorkbenchWikiDocument,
        );
      }
    });
    return (): void => {
      cancelled = true;
    };
  }, [WorkbenchWikiDocument, selectedWikiNode]);

  const updateSearchParams = (
    updater: (nextSearchParams: URLSearchParams) => void,
  ): void => {
    const nextSearchParams = new URLSearchParams(searchParams);
    updater(nextSearchParams);
    setSearchParams(nextSearchParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageChange = (page: WorkbenchPageId): void => {
    updateSearchParams((nextSearchParams: URLSearchParams): void => {
      nextSearchParams.delete('document');
      if (page === 'home') {
        nextSearchParams.delete('page');
      } else {
        nextSearchParams.set('page', page);
      }
    });
  };

  const handleWorkbenchSelect = (): void => {
    updateSearchParams((nextSearchParams: URLSearchParams): void => {
      nextSearchParams.delete('document');
      nextSearchParams.delete('page');
    });
  };

  const handleWikiNodeSelect = (node: WorkbenchWikiNode): void => {
    updateSearchParams((nextSearchParams: URLSearchParams): void => {
      nextSearchParams.set('document', node.nodeToken);
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <WorkbenchWikiSidebar
        open={sidebarOpen}
        directory={wiki.directory}
        loading={wiki.loading}
        error={wiki.error}
        activeNodeToken={selectedNodeToken}
        onOpenChange={setSidebarOpen}
        onWorkbenchSelect={handleWorkbenchSelect}
        onNodeSelect={handleWikiNodeSelect}
        onRefresh={wiki.refresh}
      />

      <div
        className={cn(
          'min-h-screen transition-[margin] duration-200',
          sidebarOpen ? 'md:ml-[248px]' : 'md:ml-[58px]',
        )}
      >
        {recoveringOAuthDocumentRoute ? (
          <main className="flex min-h-screen items-center justify-center bg-background p-6">
            <div className="w-full max-w-3xl space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-[560px] w-full" />
            </div>
          </main>
        ) : selectedWikiNode && WorkbenchWikiDocument ? (
          <WorkbenchWikiDocument
            node={selectedWikiNode}
            onBack={handleWorkbenchSelect}
          />
        ) : selectedWikiNode ? (
          <main className="flex min-h-screen items-center justify-center bg-background p-6">
            <div className="w-full max-w-3xl space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-[560px] w-full" />
            </div>
          </main>
        ) : (
          <>
            <WorkbenchTopNav
              activePage={activePage}
              onPageChange={handlePageChange}
            />
            {activePage === 'home' ? (
              <WorkbenchHomeOverview
                onPageChange={handlePageChange}
              />
            ) : null}
            {activePage === 'applications'
              ? <WorkbenchApplicationsPage />
              : null}
            {activePage === 'product-sense'
              ? (
                <WorkbenchProductSensePage />
              )
              : null}
            {activePage === 'interviews'
              ? (
                <WorkbenchInterviewsPage
                  directory={wiki.directory}
                  onNodeSelect={handleWikiNodeSelect}
                />
              )
              : null}
            {activePage === 'materials'
              ? (
                <WorkbenchMaterialsPage
                  directory={wiki.directory}
                  loading={wiki.loading}
                  onRefresh={wiki.refresh}
                  onNodeSelect={handleWikiNodeSelect}
                />
              )
              : null}
          </>
        )}
      </div>
    </div>
  );
};

export default WorkbenchPage;
