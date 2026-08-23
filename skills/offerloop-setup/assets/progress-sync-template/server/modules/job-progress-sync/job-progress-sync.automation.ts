import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';
import { Logger } from '@nestjs/common';

import { JobProgressSyncService } from './job-progress-sync.service';

@Automation()
export class JobProgressSyncAutomation {
  private readonly logger: Logger = new Logger(JobProgressSyncAutomation.name);

  constructor(private readonly progressSyncService: JobProgressSyncService) {}

  @BindTrigger('offerloop-base-reconcile')
  async reconcileBaseStates(): Promise<void> {
    const result = await this.progressSyncService.reconcileTaskStates();
    this.logger.log(
      `OfferLoop Base reconciliation scanned=${result.scanned}`
      + ` completed=${result.completed}`
      + ` missed=${result.missed}`
      + ` skipped=${result.skipped}`,
    );
  }
}
