import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';

import { JobProgressSyncService } from './job-progress-sync.service';

@Automation()
export class DailyCheckinAutomation {
  constructor(private readonly service: JobProgressSyncService) {}

  @BindTrigger('offerloop-daily-checkin')
  async sendAt2210(): Promise<void> {
    await this.service.sendDailyCheckin();
  }

  @BindTrigger('offerloop-daily-checkin-action')
  async handleAction(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.service.handleDailyCheckinAction(payload);
  }
}
