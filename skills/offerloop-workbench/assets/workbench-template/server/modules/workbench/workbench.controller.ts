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
  KnowledgeDigestResponse,
  ProductSenseAutoCompleteResponse,
  ProductSenseCompleteResponse,
  ProductSenseDraftInput,
  ProductSenseExternalCompleteInput,
  ProductSenseFeedbackInput,
  ProductSenseSelectInput,
  ProductSenseSession,
  WorkbenchApplicationsResponse,
  WorkbenchCalendarResponse,
  WorkbenchDataset,
  WorkbenchDatasetQuery,
  WorkbenchDatasetSource,
  WorkbenchInterviewsResponse,
  WorkbenchHomeResponse,
  WorkbenchHomeStageCountsResponse,
  WorkbenchResponse,
  WorkbenchWikiComponentAuthResponse,
  WorkbenchWikiDirectoryResponse,
  WorkbenchWikiDocumentPreviewResponse,
} from '@shared/api.interface';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';

import { ProductSenseService } from './product-sense.service';
import {
  type CalendarLoadResult,
  type CalendarOAuthResult,
  type DocumentComponentAuthLoadResult,
  WorkbenchCalendarService,
} from './workbench-calendar.service';
import { WorkbenchService } from './workbench.service';
import { WorkbenchWikiService } from './workbench-wiki.service';

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
    private readonly productSenseService: ProductSenseService,
    private readonly wikiService: WorkbenchWikiService,
  ) {}

  @Get()
  async getWorkbench(): Promise<WorkbenchResponse> {
    return this.workbenchService.getWorkbench();
  }

  @Get('applications')
  async getApplications(): Promise<WorkbenchApplicationsResponse> {
    return this.workbenchService.getApplications();
  }

  @Get('home')
  async getHome(): Promise<WorkbenchHomeResponse> {
    return this.workbenchService.getHome();
  }

  @Get('home/stage-counts')
  async getHomeStageCounts(): Promise<WorkbenchHomeStageCountsResponse> {
    return this.workbenchService.getHomeStageCounts();
  }

  @Get('interviews')
  async getInterviews(): Promise<WorkbenchInterviewsResponse> {
    return this.workbenchService.getInterviews();
  }

  @Get('knowledge-digest')
  async getKnowledgeDigest(): Promise<KnowledgeDigestResponse> {
    return this.workbenchService.getKnowledgeDigest();
  }

  @NeedLogin()
  @Get('wiki-directory')
  async getWikiDirectory(
    @Query('refresh') refresh?: string,
  ): Promise<WorkbenchWikiDirectoryResponse> {
    return this.wikiService.getDirectory(refresh === 'true');
  }

  @NeedLogin()
  @Get('wiki-document-preview')
  async getWikiDocumentPreview(
    @Query('nodeToken') nodeToken: string,
  ): Promise<WorkbenchWikiDocumentPreviewResponse> {
    if (!nodeToken?.trim()) {
      throw new BadRequestException('缺少知识库文档标识');
    }
    return this.wikiService.getDocumentPreview(nodeToken.trim());
  }

  @NeedLogin()
  @Get('wiki-component-auth')
  async getWikiComponentAuth(
    @Query('url') url: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WorkbenchWikiComponentAuthResponse> {
    if (!url?.trim()) {
      throw new BadRequestException('缺少飞书文档组件页面地址');
    }
    const result: DocumentComponentAuthLoadResult =
      await this.calendarService.getDocumentComponentAuth(
        String(request.headers.cookie ?? ''),
        String(request.userContext?.userId ?? ''),
        url.trim(),
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

  @Get('dataset')
  async getDataset(
    @Query('source') source: string,
    @Query('tableId') tableId?: string,
    @Query('viewId') viewId?: string,
    @Query('pageToken') pageToken?: string,
    @Query('pageSize') pageSize?: string,
    @Query('searchText') searchText?: string,
    @Query('filters') serializedFilters?: string,
  ): Promise<WorkbenchDataset> {
    if (!DATASET_SOURCES.includes(source as WorkbenchDatasetSource)) {
      throw new BadRequestException('未知的工作台数据源');
    }
    let filters: Record<string, string> | undefined;
    if (serializedFilters) {
      try {
        const parsed: unknown = JSON.parse(serializedFilters);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('invalid filters');
        }
        filters = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter((entry: [string, unknown]): boolean =>
              typeof entry[1] === 'string' && Boolean(entry[1].trim()))
            .map((entry: [string, unknown]): [string, string] => [
              entry[0],
              String(entry[1]).trim(),
            ]),
        );
      } catch {
        throw new BadRequestException('筛选条件格式无效');
      }
    }
    const query: WorkbenchDatasetQuery = {
      source: source as WorkbenchDatasetSource,
      tableId,
      viewId,
      pageToken,
      pageSize: pageSize ? Number(pageSize) : undefined,
      searchText: searchText?.trim(),
      filters,
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

  @NeedLogin()
  @Get('product-sense')
  async getProductSense(@Req() request: Request): Promise<ProductSenseSession> {
    return this.productSenseService.getSession(
      String(request.userContext?.userId ?? ''),
    );
  }

  @NeedLogin()
  @Post('product-sense/select')
  async selectProductSense(
    @Body() input: ProductSenseSelectInput,
    @Req() request: Request,
  ): Promise<ProductSenseSession> {
    return this.productSenseService.selectQuestion(
      String(request.userContext?.userId ?? ''),
      input,
    );
  }

  @NeedLogin()
  @Post('product-sense/switch')
  async switchProductSense(
    @Body() input: ProductSenseFeedbackInput,
    @Req() request: Request,
  ): Promise<ProductSenseSession> {
    return this.productSenseService.switchQuestion(
      String(request.userContext?.userId ?? ''),
      input,
    );
  }

  @NeedLogin()
  @Post('product-sense/draft')
  async saveProductSenseDraft(
    @Body() input: ProductSenseDraftInput,
    @Req() request: Request,
  ): Promise<ProductSenseSession> {
    return this.productSenseService.saveDraft(
      String(request.userContext?.userId ?? ''),
      input,
    );
  }

  @NeedLogin()
  @Post('product-sense/complete')
  async completeProductSense(
    @Req() request: Request,
  ): Promise<ProductSenseCompleteResponse> {
    return this.productSenseService.complete(
      String(request.userContext?.userId ?? ''),
    );
  }

  @NeedLogin()
  @Post('product-sense/complete-external')
  async completeExternalProductSense(
    @Body() input: ProductSenseExternalCompleteInput,
    @Req() request: Request,
  ): Promise<ProductSenseCompleteResponse> {
    return this.productSenseService.completeExternal(
      String(request.userContext?.userId ?? ''),
      input,
    );
  }

  @NeedLogin()
  @Post('product-sense/complete-auto')
  async completeProductSenseAutomatically(
    @Req() request: Request,
  ): Promise<ProductSenseAutoCompleteResponse> {
    return this.productSenseService.completeAutomatically(
      String(request.userContext?.userId ?? ''),
    );
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
        message:
          error instanceof Error ? error.message : '飞书个人日历授权失败',
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
    this.calendarService
      .getTokenCookieNames()
      .forEach((name: string, index: number): void => {
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
      });
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
