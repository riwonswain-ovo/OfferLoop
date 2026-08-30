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
  type ReminderReconcileResult,
  type ReminderRescheduleResult,
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
    },
    @Query('recordId') queryRecordId?: string,
    @Headers('x-offerloop-workflow-secret') workflowSecret?: string,
  ): Promise<ReminderReconcileResult> {
    this.jobProgressSyncService.verifyReminderReconcileSecret(workflowSecret);
    const recordId: string = extractRecordId({
      sourceRecordId: body?.recordId || String(queryRecordId ?? ''),
    });
    if (!recordId) {
      throw new BadRequestException(
        'an exact reminder record locator is required; full-table reconciliation is disabled',
      );
    }
    return this.jobProgressSyncService.reconcileReminderRecord(recordId);
  }

  @Post('reminder-reschedule')
  @HttpCode(200)
  async rescheduleReminder(
    @Body() body: {
      recordId?: string;
      plannedStart?: string;
    },
    @Headers('x-offerloop-workflow-secret') workflowSecret?: string,
  ): Promise<ReminderRescheduleResult> {
    this.jobProgressSyncService.verifyReminderReconcileSecret(workflowSecret);
    const recordId: string = extractRecordId({ sourceRecordId: body?.recordId });
    if (!recordId) {
      throw new BadRequestException('an exact reminder record ID is required');
    }
    return this.jobProgressSyncService.rescheduleReminderRecord(
      recordId,
      String(body?.plannedStart ?? '').trim(),
    );
  }
}
