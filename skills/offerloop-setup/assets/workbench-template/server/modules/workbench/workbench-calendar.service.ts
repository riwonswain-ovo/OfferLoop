import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { firstValueFrom } from 'rxjs';

import type {
  WorkbenchCalendarEvent,
  WorkbenchCalendarResponse,
} from '@shared/api.interface';

const FEISHU_API_ROOT = 'https://open.feishu.cn/open-apis';
const FEISHU_AUTHORIZE_URL =
  'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const FEISHU_OAUTH_SCOPE =
  'calendar:calendar.event:read offline_access';
const TOKEN_COOKIE = 'offerloop-calendar-session';
const STATE_COOKIE = 'offerloop-calendar-oauth-state';
const TOKEN_SAFETY_WINDOW_MS = 5 * 60 * 1000;
const STATE_LIFETIME_MS = 10 * 60 * 1000;
const RECRUITING_EVENT_PATTERN =
  /(笔试|测评|机试|面试|群面|[一二三四五]面|HR\s*面)/iu;

interface FeishuEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface FeishuPrimaryCalendarData {
  calendars?: Array<{
    calendar?: { calendar_id: string };
  }>;
}

interface FeishuEventTime {
  timestamp?: string;
  date?: string;
}

interface FeishuCalendarEvent {
  event_id: string;
  summary?: string;
  description?: string;
  status?: string;
  app_link?: string;
  start_time?: FeishuEventTime;
  end_time?: FeishuEventTime;
}

interface FeishuCalendarEventPage {
  items?: FeishuCalendarEvent[];
}

interface FeishuOAuthTokenResponse {
  code: number;
  msg?: string;
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

interface CalendarTokenSession {
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}

interface CalendarOAuthState {
  nonce: string;
  userId: string;
  expiresAt: number;
}

interface CalendarLoadResult {
  response: WorkbenchCalendarResponse;
  stateCookie?: string;
  tokenCookie?: string;
  tokenCookieMaxAgeMs?: number;
  clearTokenCookie?: boolean;
}

interface CalendarOAuthResult {
  tokenCookie: string;
  tokenCookieMaxAgeMs: number;
}

@Injectable()
export class WorkbenchCalendarService {
  private readonly logger = new Logger(WorkbenchCalendarService.name);

  constructor(private readonly httpService: HttpService) {}

  async getCalendar(
    cookieHeader: string,
    userId: string,
  ): Promise<CalendarLoadResult> {
    const encryptedSession: string = this.readCookie(cookieHeader, TOKEN_COOKIE);
    const session: CalendarTokenSession | null = encryptedSession
      ? this.decrypt<CalendarTokenSession>(encryptedSession)
      : null;
    if (!session || session.userId !== userId) {
      return this.createAuthorizationResult(userId);
    }

    let activeSession: CalendarTokenSession = session;
    let tokenCookie: string | undefined;
    try {
      if (Date.now() >= session.accessTokenExpiresAt - TOKEN_SAFETY_WINDOW_MS) {
        activeSession = await this.refreshTokenSession(session);
        tokenCookie = this.encrypt(activeSession);
      }
    } catch (error: unknown) {
      this.logger.warn(
        '个人日历授权已失效，需要重新连接',
        error instanceof Error ? error.message : undefined,
      );
      return {
        ...this.createAuthorizationResult(userId),
        clearTokenCookie: true,
      };
    }

    try {
      const events: WorkbenchCalendarEvent[] =
        await this.readCalendarEvents(activeSession.accessToken);
      return {
        response: { connected: true, events },
        tokenCookie,
        tokenCookieMaxAgeMs:
          activeSession.refreshTokenExpiresAt - Date.now(),
      };
    } catch (error: unknown) {
      this.logger.error(
        '个人日历读取失败',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        response: {
          connected: true,
          events: [],
          message: '个人日历暂时读取失败，请稍后刷新。',
        },
        tokenCookie,
        tokenCookieMaxAgeMs:
          activeSession.refreshTokenExpiresAt - Date.now(),
      };
    }
  }

  async completeOAuth(
    code: string,
    state: string,
    cookieHeader: string,
  ): Promise<CalendarOAuthResult> {
    const encryptedState: string = this.readCookie(cookieHeader, STATE_COOKIE);
    const oauthState: CalendarOAuthState | null = encryptedState
      ? this.decrypt<CalendarOAuthState>(encryptedState)
      : null;
    if (
      !oauthState
      || oauthState.nonce !== state
      || Date.now() >= oauthState.expiresAt
    ) {
      throw new BadRequestException('日历授权状态无效或已过期，请重新连接');
    }
    const token: FeishuOAuthTokenResponse = await this.requestOAuthToken({
      grant_type: 'authorization_code',
      client_id: this.requireEnv('FEISHU_APP_ID'),
      client_secret: this.requireEnv('FEISHU_APP_SECRET'),
      code,
      redirect_uri: this.getCallbackUrl(),
    });
    const session: CalendarTokenSession = this.createTokenSession(
      token,
      oauthState.userId,
    );
    return {
      tokenCookie: this.encrypt(session),
      tokenCookieMaxAgeMs: session.refreshTokenExpiresAt - Date.now(),
    };
  }

  getPublicUrl(): string {
    const rawUrl: string = this.requireEnv('WORKBENCH_PUBLIC_URL');
    const parsed: URL = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new ServiceUnavailableException('工作台公开地址配置无效');
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/u, '');
  }

  getCookiePath(): string {
    const path: string = new URL(this.getPublicUrl()).pathname.replace(/\/$/u, '');
    return path || '/';
  }

  getTokenCookieName(): string {
    return TOKEN_COOKIE;
  }

  getStateCookieName(): string {
    return STATE_COOKIE;
  }

  private createAuthorizationResult(userId: string): CalendarLoadResult {
    const oauthState: CalendarOAuthState = {
      nonce: randomBytes(24).toString('base64url'),
      userId,
      expiresAt: Date.now() + STATE_LIFETIME_MS,
    };
    const params: URLSearchParams = new URLSearchParams({
      client_id: this.requireEnv('FEISHU_APP_ID'),
      redirect_uri: this.getCallbackUrl(),
      state: oauthState.nonce,
      scope: FEISHU_OAUTH_SCOPE,
    });
    return {
      response: {
        connected: false,
        events: [],
        authorizationUrl: `${FEISHU_AUTHORIZE_URL}?${params.toString()}`,
        message: '连接飞书个人日历后，将自动展示未来 7 天笔面试安排。',
      },
      stateCookie: this.encrypt(oauthState),
    };
  }

  private async refreshTokenSession(
    session: CalendarTokenSession,
  ): Promise<CalendarTokenSession> {
    if (Date.now() >= session.refreshTokenExpiresAt) {
      throw new ServiceUnavailableException('个人日历刷新授权已过期');
    }
    const token: FeishuOAuthTokenResponse = await this.requestOAuthToken({
      grant_type: 'refresh_token',
      client_id: this.requireEnv('FEISHU_APP_ID'),
      client_secret: this.requireEnv('FEISHU_APP_SECRET'),
      refresh_token: session.refreshToken,
    });
    return this.createTokenSession(token, session.userId);
  }

  private async requestOAuthToken(
    body: { [key: string]: string },
  ): Promise<FeishuOAuthTokenResponse> {
    const response: AxiosResponse<FeishuOAuthTokenResponse> =
      await firstValueFrom(
        this.httpService.post<FeishuOAuthTokenResponse>(
          `${FEISHU_API_ROOT}/authen/v2/oauth/token`,
          body,
          { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        ),
      );
    const token: FeishuOAuthTokenResponse = response.data;
    if (
      token.code !== 0
      || !token.access_token
      || !token.refresh_token
    ) {
      this.logger.error(
        `飞书 OAuth 令牌获取失败：${token.code} ${token.msg ?? ''}`.trim(),
      );
      throw new ServiceUnavailableException('飞书个人日历授权失败');
    }
    return token;
  }

  private createTokenSession(
    token: FeishuOAuthTokenResponse,
    userId: string,
  ): CalendarTokenSession {
    const now: number = Date.now();
    return {
      userId,
      accessToken: String(token.access_token),
      accessTokenExpiresAt: now + Number(token.expires_in ?? 7200) * 1000,
      refreshToken: String(token.refresh_token),
      refreshTokenExpiresAt:
        now + Number(token.refresh_token_expires_in ?? 604800) * 1000,
    };
  }

  private async readCalendarEvents(
    accessToken: string,
  ): Promise<WorkbenchCalendarEvent[]> {
    const headers: { Authorization: string } = {
      Authorization: `Bearer ${accessToken}`,
    };
    const primaryResponse: AxiosResponse<
      FeishuEnvelope<FeishuPrimaryCalendarData>
    > = await firstValueFrom(
      this.httpService.get<FeishuEnvelope<FeishuPrimaryCalendarData>>(
        `${FEISHU_API_ROOT}/calendar/v4/calendars/primary`,
        { headers },
      ),
    );
    const primaryPayload: FeishuEnvelope<FeishuPrimaryCalendarData> =
      primaryResponse.data;
    const calendarId: string = String(
      primaryPayload.data?.calendars?.[0]?.calendar?.calendar_id ?? '',
    );
    if (primaryPayload.code !== 0 || !calendarId) {
      throw new ServiceUnavailableException('无法读取个人主日历');
    }

    const startTime: number = Math.floor(
      new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000,
    );
    const endTime: number = startTime + 7 * 24 * 60 * 60;
    const url: string =
      `${FEISHU_API_ROOT}/calendar/v4/calendars/`
      + `${encodeURIComponent(calendarId)}/events/instance_view`
      + `?start_time=${startTime}&end_time=${endTime}`;
    const response: AxiosResponse<
      FeishuEnvelope<FeishuCalendarEventPage>
    > = await firstValueFrom(
      this.httpService.get<FeishuEnvelope<FeishuCalendarEventPage>>(url, {
        headers,
      }),
    );
    const payload: FeishuEnvelope<FeishuCalendarEventPage> = response.data;
    if (payload.code !== 0 || !payload.data) {
      throw new ServiceUnavailableException('飞书日程读取失败');
    }
    return (payload.data.items ?? [])
      .filter((event: FeishuCalendarEvent): boolean =>
        event.status !== 'cancelled'
        && RECRUITING_EVENT_PATTERN.test(
          `${event.summary ?? ''} ${event.description ?? ''}`,
        ),
      )
      .map((event: FeishuCalendarEvent): WorkbenchCalendarEvent => ({
        eventId: event.event_id,
        title: event.summary?.trim() || '未命名笔面试日程',
        startAt: this.eventTimeToIso(event.start_time),
        endAt: this.eventTimeToIso(event.end_time),
        isAllDay: Boolean(event.start_time?.date),
        url: event.app_link || undefined,
      }))
      .filter((event: WorkbenchCalendarEvent): boolean => Boolean(event.startAt))
      .sort(
        (left: WorkbenchCalendarEvent, right: WorkbenchCalendarEvent): number =>
          left.startAt.localeCompare(right.startAt),
      );
  }

  private eventTimeToIso(value: FeishuEventTime | undefined): string {
    if (value?.timestamp) {
      return new Date(Number(value.timestamp) * 1000).toISOString();
    }
    return value?.date ? `${value.date}T00:00:00+08:00` : '';
  }

  private getCallbackUrl(): string {
    return `${this.getPublicUrl()}/api/workbench/calendar/oauth/callback`;
  }

  private requireEnv(name: string): string {
    const value: string = String(process.env[name] ?? '').trim();
    if (!value) {
      throw new ServiceUnavailableException(`工作台缺少环境变量：${name}`);
    }
    return value;
  }

  private readCookie(cookieHeader: string, name: string): string {
    const prefix: string = `${name}=`;
    const rawCookie: string | undefined = cookieHeader
      .split(';')
      .map((part: string): string => part.trim())
      .find((part: string): boolean => part.startsWith(prefix));
    return rawCookie ? decodeURIComponent(rawCookie.slice(prefix.length)) : '';
  }

  private getEncryptionKey(): Buffer {
    return createHash('sha256')
      .update(this.requireEnv('FEISHU_CALENDAR_COOKIE_SECRET'))
      .digest();
  }

  private encrypt<T>(payload: T): string {
    const iv: Buffer = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted: Buffer = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((part: Buffer): string => part.toString('base64url'))
      .join('.');
  }

  private decrypt<T>(value: string): T | null {
    try {
      const [ivValue, tagValue, encryptedValue]: string[] = value.split('.');
      if (!ivValue || !tagValue || !encryptedValue) {
        return null;
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getEncryptionKey(),
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      const decrypted: Buffer = Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]);
      return JSON.parse(decrypted.toString('utf8')) as T;
    } catch (_error: unknown) {
      return null;
    }
  }
}

export type { CalendarLoadResult, CalendarOAuthResult };
