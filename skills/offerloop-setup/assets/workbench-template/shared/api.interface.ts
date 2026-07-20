export type BaseCellValue =
  | string
  | number
  | boolean
  | null
  | BaseCellValue[]
  | { [key: string]: BaseCellValue };

export interface WorkbenchRecord {
  recordId: string;
  fields: { [key: string]: BaseCellValue };
}

export interface WorkbenchDataset {
  records: WorkbenchRecord[];
  total: number;
  hasMore: boolean;
  pageToken?: string;
  sourceUrl: string;
}

export interface WorkbenchViewDataset extends WorkbenchDataset {
  viewId: string;
  viewName: string;
  viewType: string;
}

export interface WorkbenchTableDataset extends WorkbenchViewDataset {
  tableId: string;
  tableName: string;
}

export interface WorkbenchResponse {
  generatedAt: string;
  calendarSourceUrl: string;
  companies: WorkbenchDataset;
  companyViews: WorkbenchViewDataset[];
  progress: WorkbenchDataset;
  progressViews: WorkbenchViewDataset[];
  events: WorkbenchDataset;
  eventTables: WorkbenchTableDataset[];
}
