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
