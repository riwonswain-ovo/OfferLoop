import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';

import type {
  JobProgressHealthResponse,
  JobProgressSyncRequest,
  JobProgressSyncResponse,
} from '@shared/api.interface';

import {
  type CardActionCallback,
  type CardActionResponse,
  type FeishuCallbackChallenge,
  type ReminderReconcileResult,
  type TaskReconcileResult,
  JobProgressSyncService,
} from './job-progress-sync.service';

function extractRecordId(body: JobProgressSyncRequest): string {
  const candidates: string[] = [body?.sourceRecordId, body?.sourceRecordLink]
    .map((value: string | undefined): string => String(value ?? '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (/^rec[A-Za-z0-9]+$/u.test(candidate)) {
      return candidate;
    }
    try {
      const url: URL = new URL(candidate);
      for (const key of ['record', 'recordId', 'record_id']) {
        const value: string = String(url.searchParams.get(key) ?? '').trim();
        if (/^rec[A-Za-z0-9]+$/u.test(value)) {
          return value;
        }
      }
    } catch {
      // A non-URL candidate may still contain a record ID copied from Feishu.
    }
    const match: RegExpMatchArray | null = candidate.match(/\b(rec[A-Za-z0-9]+)\b/u);
    if (match) {
      return match[1];
    }
  }
  return '';
}

@Controller('openapi/job-progress-sync')
export class JobProgressSyncOpenApiController {
  constructor(private readonly jobProgressSyncService: JobProgressSyncService) {}

  @Get('health')
  health(): JobProgressHealthResponse {
    return { ok: true, service: 'job-progress-sync' };
  }

  @Post()
  @HttpCode(200)
  async sync(
    @Body() body: JobProgressSyncRequest,
    @Query('sourceRecordId') querySourceRecordId?: string,
    @Query('sourceRecordLink') querySourceRecordLink?: string,
  ): Promise<JobProgressSyncResponse> {
    const sourceRecordId: string = extractRecordId({
      sourceRecordId: body?.sourceRecordId || String(querySourceRecordId ?? ''),
      sourceRecordLink: body?.sourceRecordLink || String(querySourceRecordLink ?? ''),
      transitionedAt: body?.transitionedAt,
    });
    if (!sourceRecordId) {
      throw new BadRequestException('sourceRecordId or sourceRecordLink is required');
    }
    return this.jobProgressSyncService.sync({
      sourceRecordId,
      transitionedAt: body.transitionedAt,
    });
  }

  @Post('reminder-reconcile')
  @HttpCode(200)
  async reconcileReminder(
    @Body() body: {
      recordId?: string;
      recordLink?: string;
      sourceEmailId?: string;
      recordTitle?: string;
    },
    @Query('recordId') queryRecordId?: string,
    @Query('recordLink') queryRecordLink?: string,
    @Headers('x-offerloop-workflow-secret') workflowSecret?: string,
  ): Promise<ReminderReconcileResult | TaskReconcileResult> {
    this.jobProgressSyncService.verifyReminderReconcileSecret(workflowSecret);
    let recordId: string = extractRecordId({
      sourceRecordId: body?.recordId || String(queryRecordId ?? ''),
      sourceRecordLink: body?.recordLink || String(queryRecordLink ?? ''),
    });
    if (!recordId) {
      recordId = await this.jobProgressSyncService.resolveReminderRecordId(
        body?.sourceEmailId ?? '',
        body?.recordTitle ?? '',
      );
    }
    if (!recordId) {
      return this.jobProgressSyncService.reconcileTaskStates();
    }
    return this.jobProgressSyncService.reconcileReminderRecord(recordId);
  }

  @Post('card-action')
  @HttpCode(200)
  async cardAction(
    @Body() body: CardActionCallback & FeishuCallbackChallenge,
  ): Promise<CardActionResponse | { challenge: string }> {
    if (body.challenge) {
      return this.jobProgressSyncService.verifyCallbackChallenge(body);
    }
    return this.jobProgressSyncService.handleDailyCheckinAction(body);
  }
}
