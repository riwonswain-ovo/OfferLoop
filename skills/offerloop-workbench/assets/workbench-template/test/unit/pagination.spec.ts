import {
  getWorkbenchDatasetKey,
  getWorkbenchPageCount,
  WORKBENCH_PAGE_SIZE,
} from '../../client/src/pages/workbench/pagination';

describe('workbench pagination', () => {
  it('uses 9 records per server-side page', () => {
    expect(WORKBENCH_PAGE_SIZE).toBe(9);
    expect(getWorkbenchPageCount(65)).toBe(8);
    expect(getWorkbenchPageCount(0)).toBe(1);
    expect(getWorkbenchPageCount(65, 15)).toBe(5);
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
