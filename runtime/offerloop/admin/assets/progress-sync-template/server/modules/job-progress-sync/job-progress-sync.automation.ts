import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';
import { JobProgressSyncService } from './job-progress-sync.service';

@Automation()
export class JobProgressSyncAutomation {
  constructor(private readonly progressSyncService: JobProgressSyncService) {}

  @BindTrigger('offerloop-daily-checkin')
  async sendDailyCheckin(): Promise<void> {
    await this.progressSyncService.sendDailyCheckin();
  }

  @BindTrigger('offerloop-daily-checkin-action')
  async handleAction(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.progressSyncService.handleDailyCheckinAction(payload);
  }
}
