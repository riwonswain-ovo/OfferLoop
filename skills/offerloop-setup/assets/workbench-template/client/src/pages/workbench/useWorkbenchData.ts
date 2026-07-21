import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  WorkbenchCalendarResponse,
  WorkbenchDataset,
  WorkbenchDatasetQuery,
  WorkbenchDatasetSource,
  WorkbenchResponse,
  WorkbenchTableMeta,
  WorkbenchViewMeta,
} from '@shared/api.interface';

import {
  completeWorkbenchCalendarOAuth,
  getWorkbench,
  getWorkbenchCalendar,
  getWorkbenchDataset,
} from '@client/src/api';

import { getWorkbenchDatasetKey } from './pagination';

interface DatasetSelection {
  source: WorkbenchDatasetSource;
  tableId?: string;
  viewId?: string;
}

interface WorkbenchLoadingState {
  companies: boolean;
  progress: boolean;
  events: boolean;
}

interface WorkbenchDataState {
  data: WorkbenchResponse | null;
  calendar: WorkbenchCalendarResponse | null;
  loading: boolean;
  calendarLoading: boolean;
  datasetLoading: WorkbenchLoadingState;
  error: string;
  selectedDataset: WorkbenchDatasetSource;
  selectedCompanyView: string;
  selectedProgressView: string;
  selectedEventTable: string;
  selectedEventView: string;
  activeCompanyView?: WorkbenchViewMeta;
  activeProgressView?: WorkbenchViewMeta;
  activeEventTable?: WorkbenchTableMeta;
  activeEventView?: WorkbenchViewMeta;
  companyDataset: WorkbenchDataset | null;
  progressDataset: WorkbenchDataset | null;
  eventDataset: WorkbenchDataset | null;
  companyPage: number;
  progressPage: number;
  eventPage: number;
  selectedDatasetUrl: string;
  setSelectedDataset: (source: WorkbenchDatasetSource) => void;
  loadWorkbench: () => Promise<void>;
  loadCalendar: () => Promise<void>;
  selectCompanyView: (viewId: string) => Promise<void>;
  selectProgressView: (viewId: string) => Promise<void>;
  selectEventTable: (tableId: string) => Promise<void>;
  selectEventView: (viewId: string) => Promise<void>;
  changeCompanyPage: (page: number) => Promise<void>;
  changeProgressPage: (page: number) => Promise<void>;
  changeEventPage: (page: number) => Promise<void>;
}

const INITIAL_LOADING: WorkbenchLoadingState = {
  companies: false,
  progress: false,
  events: false,
};

const useWorkbenchData = (): WorkbenchDataState => {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [calendar, setCalendar] =
    useState<WorkbenchCalendarResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [calendarLoading, setCalendarLoading] = useState<boolean>(true);
  const [datasetLoading, setDatasetLoading] =
    useState<WorkbenchLoadingState>(INITIAL_LOADING);
  const [error, setError] = useState<string>('');
  const [selectedDataset, setSelectedDataset] =
    useState<WorkbenchDatasetSource>('companies');
  const [selectedCompanyView, setSelectedCompanyView] = useState<string>('');
  const [selectedProgressView, setSelectedProgressView] = useState<string>('');
  const [selectedEventTable, setSelectedEventTable] = useState<string>('');
  const [selectedEventView, setSelectedEventView] = useState<string>('');
  const [companyDataset, setCompanyDataset] =
    useState<WorkbenchDataset | null>(null);
  const [progressDataset, setProgressDataset] =
    useState<WorkbenchDataset | null>(null);
  const [eventDataset, setEventDataset] =
    useState<WorkbenchDataset | null>(null);
  const [companyPage, setCompanyPage] = useState<number>(1);
  const [progressPage, setProgressPage] = useState<number>(1);
  const [eventPage, setEventPage] = useState<number>(1);
  const pageTokensRef = useRef<Map<string, string[]>>(new Map());
  const oauthCompletionStartedRef = useRef<boolean>(false);
  const initialLoadStartedRef = useRef<boolean>(false);
  const datasetCacheRef =
    useRef<Map<string, Map<number, WorkbenchDataset>>>(new Map());

  const activeCompanyView: WorkbenchViewMeta | undefined = useMemo(
    () => data?.companyViews.find(
      (view: WorkbenchViewMeta): boolean =>
        view.viewId === selectedCompanyView,
    ) ?? data?.companyViews[0],
    [data, selectedCompanyView],
  );
  const activeProgressView: WorkbenchViewMeta | undefined = useMemo(
    () => data?.progressViews.find(
      (view: WorkbenchViewMeta): boolean =>
        view.viewId === selectedProgressView,
    ) ?? data?.progressViews[0],
    [data, selectedProgressView],
  );
  const activeEventTable: WorkbenchTableMeta | undefined = useMemo(
    () => data?.eventTables.find(
      (table: WorkbenchTableMeta): boolean =>
        table.tableId === selectedEventTable,
    ) ?? data?.eventTables[0],
    [data, selectedEventTable],
  );
  const activeEventView: WorkbenchViewMeta | undefined = useMemo(
    () => activeEventTable?.views.find(
      (view: WorkbenchViewMeta): boolean =>
        view.viewId === selectedEventView,
    ) ?? activeEventTable?.views[0],
    [activeEventTable, selectedEventView],
  );

  const cacheDataset = (
    selection: DatasetSelection,
    page: number,
    dataset: WorkbenchDataset,
  ): void => {
    const key: string = getWorkbenchDatasetKey(
      selection.source,
      selection.tableId,
      selection.viewId,
    );
    const cache: Map<number, WorkbenchDataset> =
      datasetCacheRef.current.get(key) ?? new Map<number, WorkbenchDataset>();
    cache.set(page, dataset);
    datasetCacheRef.current.set(key, cache);
    const tokens: string[] = pageTokensRef.current.get(key) ?? [''];
    if (dataset.nextPageToken) {
      tokens[page] = dataset.nextPageToken;
    }
    pageTokensRef.current.set(key, tokens);
  };

  const applyDataset = (
    source: WorkbenchDatasetSource,
    dataset: WorkbenchDataset,
    page: number,
  ): void => {
    if (source === 'companies') {
      setCompanyDataset(dataset);
      setCompanyPage(page);
    } else if (source === 'progress') {
      setProgressDataset(dataset);
      setProgressPage(page);
    } else {
      setEventDataset(dataset);
      setEventPage(page);
    }
  };

  const loadDataset = async (
    selection: DatasetSelection,
    page: number,
  ): Promise<void> => {
    const key: string = getWorkbenchDatasetKey(
      selection.source,
      selection.tableId,
      selection.viewId,
    );
    const cached: WorkbenchDataset | undefined =
      datasetCacheRef.current.get(key)?.get(page);
    if (cached) {
      applyDataset(selection.source, cached, page);
      return;
    }
    const tokens: string[] = pageTokensRef.current.get(key) ?? [''];
    const pageToken: string | undefined = tokens[page - 1];
    if (page > 1 && pageToken === undefined) {
      return;
    }
    setDatasetLoading(
      (current: WorkbenchLoadingState): WorkbenchLoadingState => ({
        ...current,
        [selection.source]: true,
      }),
    );
    setError('');
    try {
      const query: WorkbenchDatasetQuery = {
        ...selection,
        pageToken: pageToken || undefined,
      };
      const dataset: WorkbenchDataset = await getWorkbenchDataset(query);
      cacheDataset(selection, page, dataset);
      applyDataset(selection.source, dataset, page);
    } catch (_error: unknown) {
      setError('分页数据读取失败，请稍后重试。');
    } finally {
      setDatasetLoading(
        (current: WorkbenchLoadingState): WorkbenchLoadingState => ({
          ...current,
          [selection.source]: false,
        }),
      );
    }
  };

  const loadWorkbench = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const response: WorkbenchResponse = await getWorkbench();
      const companyView: WorkbenchViewMeta = response.companyViews[0];
      const progressView: WorkbenchViewMeta = response.progressViews[0];
      const eventTable: WorkbenchTableMeta = response.eventTables[0];
      const eventView: WorkbenchViewMeta = eventTable.views[0];
      datasetCacheRef.current.clear();
      pageTokensRef.current.clear();
      setData(response);
      setSelectedCompanyView(companyView.viewId);
      setSelectedProgressView(progressView.viewId);
      setSelectedEventTable(eventTable.tableId);
      setSelectedEventView(eventView.viewId);
      setCompanyDataset(response.companies);
      setProgressDataset(response.progress);
      setEventDataset(response.events);
      setCompanyPage(1);
      setProgressPage(1);
      setEventPage(1);
      cacheDataset(
        { source: 'companies', viewId: companyView.viewId },
        1,
        response.companies,
      );
      cacheDataset(
        { source: 'progress', viewId: progressView.viewId },
        1,
        response.progress,
      );
      cacheDataset(
        {
          source: 'events',
          tableId: eventTable.tableId,
          viewId: eventView.viewId,
        },
        1,
        response.events,
      );
    } catch (_error: unknown) {
      setError('暂时无法读取飞书 Base，请稍后重试或检查应用授权。');
    } finally {
      setLoading(false);
    }
  };

  const loadCalendar = async (): Promise<void> => {
    setCalendarLoading(true);
    try {
      setCalendar(await getWorkbenchCalendar());
    } catch (_error: unknown) {
      setCalendar({
        connected: false,
        events: [],
        message: '个人日历暂时无法读取，请稍后刷新。',
      });
    } finally {
      setCalendarLoading(false);
    }
  };

  const completeCalendarOAuth = async (): Promise<void> => {
    const params: URLSearchParams = new URLSearchParams(window.location.search);
    const isOAuthCallback: boolean = window.location.pathname.endsWith(
      '/calendar-oauth-callback',
    );
    if (!isOAuthCallback) {
      await loadCalendar();
      return;
    }
    if (oauthCompletionStartedRef.current) {
      return;
    }
    oauthCompletionStartedRef.current = true;
    const code: string = String(params.get('code') ?? '');
    const state: string = String(params.get('state') ?? '');
    const denied: boolean = params.get('error') === 'access_denied';
    const workbenchPath: string = window.location.pathname.replace(
      /\/calendar-oauth-callback$/u,
      '',
    );
    window.history.replaceState({}, document.title, workbenchPath);
    if (denied) {
      setCalendar({
        connected: false,
        events: [],
        message: '你已取消个人日历授权，可稍后重新连接。',
      });
      setCalendarLoading(false);
      return;
    }
    if (!code || !state) {
      setCalendar({
        connected: false,
        events: [],
        message: '个人日历授权回跳缺少必要参数，请重新连接。',
      });
      setCalendarLoading(false);
      return;
    }
    setCalendarLoading(true);
    try {
      const completion: { connected: boolean; message?: string } =
        await completeWorkbenchCalendarOAuth(code, state);
      if (!completion.connected) {
        setCalendar({
          connected: false,
          events: [],
          message: completion.message ?? '飞书个人日历授权失败',
        });
        setCalendarLoading(false);
        return;
      }
      await loadCalendar();
    } catch (error: unknown) {
      const responseMessage: unknown = (
        error as { response?: { data?: { message?: unknown } } }
      ).response?.data?.message;
      setCalendar({
        connected: false,
        events: [],
        message: typeof responseMessage === 'string'
          ? responseMessage
          : '个人日历授权未能完成，请重新连接。',
      });
      setCalendarLoading(false);
    }
  };

  useEffect(() => {
    if (initialLoadStartedRef.current) {
      return;
    }
    initialLoadStartedRef.current = true;
    void loadWorkbench();
    void completeCalendarOAuth();
  }, []);

  const selectCompanyView = async (viewId: string): Promise<void> => {
    setSelectedCompanyView(viewId);
    await loadDataset({ source: 'companies', viewId }, 1);
  };

  const selectProgressView = async (viewId: string): Promise<void> => {
    setSelectedProgressView(viewId);
    await loadDataset({ source: 'progress', viewId }, 1);
  };

  const selectEventTable = async (tableId: string): Promise<void> => {
    const table: WorkbenchTableMeta | undefined = data?.eventTables.find(
      (candidate: WorkbenchTableMeta): boolean =>
        candidate.tableId === tableId,
    );
    const viewId: string = table?.views[0]?.viewId ?? '';
    setSelectedEventTable(tableId);
    setSelectedEventView(viewId);
    await loadDataset({ source: 'events', tableId, viewId }, 1);
  };

  const selectEventView = async (viewId: string): Promise<void> => {
    const tableId: string = activeEventTable?.tableId ?? '';
    setSelectedEventView(viewId);
    await loadDataset({ source: 'events', tableId, viewId }, 1);
  };

  const selectedDatasetUrl: string = selectedDataset === 'progress'
    ? progressDataset?.sourceUrl ?? ''
    : selectedDataset === 'events'
      ? eventDataset?.sourceUrl ?? ''
      : companyDataset?.sourceUrl ?? '';

  return {
    data,
    calendar,
    loading,
    calendarLoading,
    datasetLoading,
    error,
    selectedDataset,
    selectedCompanyView,
    selectedProgressView,
    selectedEventTable,
    selectedEventView,
    activeCompanyView,
    activeProgressView,
    activeEventTable,
    activeEventView,
    companyDataset,
    progressDataset,
    eventDataset,
    companyPage,
    progressPage,
    eventPage,
    selectedDatasetUrl,
    setSelectedDataset,
    loadWorkbench,
    loadCalendar,
    selectCompanyView,
    selectProgressView,
    selectEventTable,
    selectEventView,
    changeCompanyPage: (page: number): Promise<void> => loadDataset(
      { source: 'companies', viewId: activeCompanyView?.viewId },
      page,
    ),
    changeProgressPage: (page: number): Promise<void> => loadDataset(
      { source: 'progress', viewId: activeProgressView?.viewId },
      page,
    ),
    changeEventPage: (page: number): Promise<void> => loadDataset(
      {
        source: 'events',
        tableId: activeEventTable?.tableId,
        viewId: activeEventView?.viewId,
      },
      page,
    ),
  };
};

export { useWorkbenchData };
export type { WorkbenchDataState };
