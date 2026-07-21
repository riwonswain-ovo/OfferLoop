import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
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
    if (result.clearTokenCookies) {
      this.clearTokenCookies(response, cookiePath);
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
    if (result.tokenCookieParts) {
      this.setTokenCookies(
        response,
        cookiePath,
        result.tokenCookieParts,
        result.tokenCookieMaxAgeMs ?? 0,
      );
    }
    return result.response;
  }

  @Post('calendar/oauth/complete')
  async completeCalendarOAuth(
    @Body('code') code: string,
    @Body('state') state: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ connected: boolean; message?: string }> {
    if (!code || !state) {
      throw new BadRequestException('飞书日历授权回调缺少必要参数');
    }
    let result: CalendarOAuthResult;
    try {
      result = await this.calendarService.completeOAuth(
        code,
        state,
        String(request.headers.cookie ?? ''),
      );
    } catch (error: unknown) {
      return {
        connected: false,
        message: error instanceof Error
          ? error.message
          : '飞书个人日历授权失败',
      };
    }
    const cookiePath: string = this.calendarService.getCookiePath();
    this.setTokenCookies(
      response,
      cookiePath,
      result.tokenCookieParts,
      result.tokenCookieMaxAgeMs,
    );
    response.clearCookie(this.calendarService.getStateCookieName(), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: cookiePath,
    });
    return { connected: true };
  }

  private setTokenCookies(
    response: Response,
    path: string,
    parts: string[],
    maxAgeMs: number,
  ): void {
    this.calendarService.getTokenCookieNames().forEach(
      (name: string, index: number): void => {
        const value: string | undefined = parts[index];
        if (!value) {
          response.clearCookie(name, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path,
          });
          return;
        }
        response.cookie(name, value, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path,
          maxAge: Math.max(maxAgeMs, 60_000),
        });
      },
    );
  }

  private clearTokenCookies(response: Response, path: string): void {
    this.calendarService.getTokenCookieNames().forEach((name: string): void => {
      response.clearCookie(name, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path,
      });
    });
  }
}
