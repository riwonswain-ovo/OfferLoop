import {
  getWorkbenchDatasetKey,
  getWorkbenchPageCount,
  WORKBENCH_PAGE_SIZE,
} from '../../client/src/pages/workbench/pagination';

describe('workbench pagination', () => {
  it('uses 30 records per server-side page', () => {
    expect(WORKBENCH_PAGE_SIZE).toBe(30);
    expect(getWorkbenchPageCount(65)).toBe(3);
    expect(getWorkbenchPageCount(0)).toBe(1);
  });

  it('keeps page-token caches isolated by source, table, and view', () => {
    expect(getWorkbenchDatasetKey('events', 'table-1', 'view-1')).toBe(
      'events:table-1:view-1',
    );
    expect(getWorkbenchDatasetKey('companies', '', 'view-1')).not.toBe(
      getWorkbenchDatasetKey('progress', '', 'view-1'),
    );
  });
});
