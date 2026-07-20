import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { JobProgressSyncOpenApiController } from './job-progress-sync.openapi.controller';
import { JobProgressSyncService } from './job-progress-sync.service';

@Module({
  imports: [HttpModule],
  controllers: [JobProgressSyncOpenApiController],
  providers: [JobProgressSyncService],
})
export class JobProgressSyncModule {}
