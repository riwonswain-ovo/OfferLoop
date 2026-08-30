import { JobProgressSyncAutomation } from '../../server/modules/job-progress-sync/job-progress-sync.automation';
import { JobProgressSyncService } from '../../server/modules/job-progress-sync/job-progress-sync.service';

describe('JobProgressSyncAutomation', (): void => {
  it('delegates the daily check-in trigger to the service', async (): Promise<void> => {
    const sendDailyCheckin = jest.fn<Promise<{ sent: boolean; count: number }>, []>()
      .mockResolvedValue({ sent: true, count: 2 });
    const service: JobProgressSyncService = {
      sendDailyCheckin,
    } as unknown as JobProgressSyncService;
    const automation: JobProgressSyncAutomation = new JobProgressSyncAutomation(service);

    await expect(automation.sendDailyCheckin()).resolves.toBeUndefined();
    expect(sendDailyCheckin).toHaveBeenCalledTimes(1);
  });

  it('delegates card actions to the exact-record handler', async (): Promise<void> => {
    const handleDailyCheckinAction = jest.fn<
      Promise<Record<string, unknown>>,
      [Record<string, unknown>]
    >().mockResolvedValue({ toast: { type: 'success', content: 'ok' } });
    const service: JobProgressSyncService = {
      handleDailyCheckinAction,
    } as unknown as JobProgressSyncService;
    const automation: JobProgressSyncAutomation = new JobProgressSyncAutomation(service);

    const payload: Record<string, unknown> = { event: { action: {} } };
    await expect(automation.handleAction(payload)).resolves.toEqual({
      toast: { type: 'success', content: 'ok' },
    });
    expect(handleDailyCheckinAction).toHaveBeenCalledWith(payload);
  });
});
