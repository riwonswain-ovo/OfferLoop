import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type {
  WorkbenchCalendarResponse,
  WorkbenchDataset,
  WorkbenchDatasetQuery,
  WorkbenchDatasetSource,
  WorkbenchResponse,
} from '@shared/api.interface';

import {
  type CalendarLoadResult,
  type CalendarOAuthResult,
  WorkbenchCalendarService,
} from './workbench-calendar.service';
import { WorkbenchService } from './workbench.service';

const DATASET_SOURCES: WorkbenchDatasetSource[] = [
  'companies',
  'progress',
  'events',
];

@Controller('api/workbench')
export class WorkbenchController {
  constructor(
    private readonly workbenchService: WorkbenchService,
    private readonly calendarService: WorkbenchCalendarService,
  ) {}

  @Get()
  async getWorkbench(): Promise<WorkbenchResponse> {
    return this.workbenchService.getWorkbench();
  }

  @Get('dataset')
  async getDataset(
    @Query('source') source: string,
    @Query('tableId') tableId?: string,
    @Query('viewId') viewId?: string,
    @Query('pageToken') pageToken?: string,
  ): Promise<WorkbenchDataset> {
    if (!DATASET_SOURCES.includes(source as WorkbenchDatasetSource)) {
      throw new BadRequestException('未知的工作台数据源');
    }
    const query: WorkbenchDatasetQuery = {
      source: source as WorkbenchDatasetSource,
      tableId,
      viewId,
      pageToken,
    };
    return this.workbenchService.getDataset(query);
  }

  @Get('calendar')
  async getCalendar(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WorkbenchCalendarResponse> {
    const result: CalendarLoadResult = await this.calendarService.getCalendar(
      String(request.headers.cookie ?? ''),
      String(request.userContext?.userId ?? ''),
    );
    const cookiePath: string = this.calendarService.getCookiePath();
    if (result.clearTokenCookie) {
      response.clearCookie(this.calendarService.getTokenCookieName(), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: cookiePath,
      });
    }
    if (result.stateCookie) {
      response.cookie(
        this.calendarService.getStateCookieName(),
        result.stateCookie,
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: cookiePath,
          maxAge: 10 * 60 * 1000,
        },
      );
    }
    if (result.tokenCookie) {
      response.cookie(
        this.calendarService.getTokenCookieName(),
        result.tokenCookie,
        {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: cookiePath,
          maxAge: Math.max(result.tokenCookieMaxAgeMs ?? 0, 60_000),
        },
      );
    }
    return result.response;
  }

  @Get('calendar/oauth/callback')
  async completeCalendarOAuth(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!code || !state) {
      throw new BadRequestException('飞书日历授权回调缺少必要参数');
    }
    const result: CalendarOAuthResult =
      await this.calendarService.completeOAuth(
        code,
        state,
        String(request.headers.cookie ?? ''),
      );
    const cookiePath: string = this.calendarService.getCookiePath();
    response.cookie(
      this.calendarService.getTokenCookieName(),
      result.tokenCookie,
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: cookiePath,
        maxAge: Math.max(result.tokenCookieMaxAgeMs, 60_000),
      },
    );
    response.clearCookie(this.calendarService.getStateCookieName(), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: cookiePath,
    });
    response.redirect(`${this.calendarService.getPublicUrl()}?calendar=connected`);
  }
}
