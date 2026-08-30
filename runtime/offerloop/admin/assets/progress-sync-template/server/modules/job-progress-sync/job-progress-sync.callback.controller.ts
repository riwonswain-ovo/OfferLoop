import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Public } from '@lark-apaas/fullstack-nestjs-core';
import type { Response } from 'express';

import {
  type CardActionCallback,
  type CardActionResponse,
  type FeishuCallbackChallenge,
  JobProgressSyncService,
} from './job-progress-sync.service';

@Public()
@Controller('callbacks/feishu')
export class JobProgressSyncCallbackController {
  constructor(private readonly jobProgressSyncService: JobProgressSyncService) {}

  @Post('card-action')
  @HttpCode(200)
  async handleCardAction(
    @Body() body: CardActionCallback & FeishuCallbackChallenge,
    @Res() response: Response,
  ): Promise<void> {
    if (body.challenge) {
      response.status(200).json(this.jobProgressSyncService.verifyCallbackChallenge(body));
      return;
    }
    const acknowledgement: CardActionResponse = this.jobProgressSyncService
      .acknowledgeDailyCheckinAction(body);
    response.status(200).json(acknowledgement);
    await this.jobProgressSyncService.processDailyCheckinActionAfterAck(body);
  }
}
