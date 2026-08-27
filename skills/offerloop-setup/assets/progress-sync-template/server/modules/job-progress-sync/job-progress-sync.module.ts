import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { JobProgressSyncOpenApiController } from './job-progress-sync.openapi.controller';
import { JobProgressSyncService } from './job-progress-sync.service';
import { DailyCheckinAutomation } from './daily-checkin.automation';

@Module({
  imports: [HttpModule],
  controllers: [JobProgressSyncOpenApiController],
  providers: [JobProgressSyncService, DailyCheckinAutomation],
})
export class JobProgressSyncModule {}
