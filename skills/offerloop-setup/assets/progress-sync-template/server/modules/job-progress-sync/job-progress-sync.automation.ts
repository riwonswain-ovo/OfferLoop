import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';
import { Logger } from '@nestjs/common';

import { JobProgressSyncService } from './job-progress-sync.service';

@Automation()
export class JobProgressSyncAutomation {
  private readonly logger: Logger = new Logger(JobProgressSyncAutomation.name);

  constructor(private readonly progressSyncService: JobProgressSyncService) {}

  @BindTrigger('offerloop-daily-checkin')
  async sendDailyCheckin(): Promise<void> {
    const result = await this.progressSyncService.sendDailyCheckin();
    this.logger.log(
      `OfferLoop daily check-in ${result.status}`
      + (result.reason ? `: ${result.reason}` : ''),
    );
  }

  @BindTrigger('offerloop-task-reconcile')
  async reconcileTaskStates(): Promise<void> {
    const result = await this.progressSyncService.reconcileTaskStates();
    this.logger.log(
      `OfferLoop task reconciliation scanned=${result.scanned}`
      + ` provisioned=${result.provisioned}`
      + ` completed=${result.completed}`
      + ` missed=${result.missed}`
      + ` postponed=${result.postponed}`
      + ` skipped=${result.skipped}`,
    );
  }
}
