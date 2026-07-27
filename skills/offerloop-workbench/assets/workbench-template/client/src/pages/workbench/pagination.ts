const WORKBENCH_PAGE_SIZE = 30;

const getWorkbenchPageCount = (total: number): number =>
  Math.max(1, Math.ceil(total / WORKBENCH_PAGE_SIZE));

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
