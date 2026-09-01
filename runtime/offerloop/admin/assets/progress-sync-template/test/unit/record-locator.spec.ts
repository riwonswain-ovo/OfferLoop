import { extractRecordId } from '../../server/modules/job-progress-sync/record-locator';

describe('record locator', (): void => {
  it('accepts the exact enterprise record id supplied by a workflow query', (): void => {
    expect(extractRecordId({ sourceRecordId: 'recSourceQuery' })).toBe('recSourceQuery');
  });

  it('accepts the exact reminder record id supplied by a workflow query', (): void => {
    expect(extractRecordId({ sourceRecordId: 'recReminderQuery' })).toBe(
      'recReminderQuery',
    );
  });

  it('rejects a missing or non-record locator', (): void => {
    expect(extractRecordId({ sourceRecordId: '' })).toBe('');
    expect(extractRecordId({ sourceRecordId: 'company-title' })).toBe('');
  });
});
