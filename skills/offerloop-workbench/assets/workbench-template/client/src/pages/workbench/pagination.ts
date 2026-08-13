const WORKBENCH_PAGE_SIZE = 9;

const getWorkbenchPageCount = (
  total: number,
  pageSize = WORKBENCH_PAGE_SIZE,
): number => Math.max(1, Math.ceil(total / pageSize));

const getWorkbenchDatasetKey = (
  source: string,
  tableId = '',
  viewId = '',
): string => `${source}:${tableId}:${viewId}`;

export {
  WORKBENCH_PAGE_SIZE,
  getWorkbenchDatasetKey,
  getWorkbenchPageCount,
};
