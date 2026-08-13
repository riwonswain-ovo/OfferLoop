import {
  getWorkbenchOAuthRecoveryRoute,
} from '../../client/src/pages/workbench/workbench-oauth';

describe('getWorkbenchOAuthRecoveryRoute', () => {
  it('keeps the selected document while removing OAuth credentials', () => {
    expect(getWorkbenchOAuthRecoveryRoute(
      '/app/app_test/calendar-oauth-callback',
      '?code=secret-code&state=secret-state&page=materials&document=node-1',
    )).toBe('/app/app_test?page=materials&document=node-1');
  });

  it('returns the workbench root for a normal OAuth callback', () => {
    expect(getWorkbenchOAuthRecoveryRoute(
      '/app/app_test/calendar-oauth-callback',
      '?code=secret-code&state=secret-state',
    )).toBe('/app/app_test');
  });
});
