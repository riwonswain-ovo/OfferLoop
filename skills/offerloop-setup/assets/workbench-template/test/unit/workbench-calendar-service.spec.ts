import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

import type { WorkbenchCalendarResponse } from '@shared/api.interface';

import {
  type CalendarLoadResult,
  type CalendarOAuthResult,
  WorkbenchCalendarService,
} from '../../server/modules/workbench/workbench-calendar.service';

describe('WorkbenchCalendarService', () => {
  const env: { [key: string]: string } = {
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret',
    FEISHU_CALENDAR_COOKIE_SECRET: 'test-cookie-secret',
    WORKBENCH_PUBLIC_URL: 'https://example.com/app/app_test',
  };

  beforeEach(() => {
    Object.entries(env).forEach(([key, value]: [string, string]): void => {
      process.env[key] = value;
    });
  });

  afterEach(() => {
    Object.keys(env).forEach((key: string): void => {
      delete process.env[key];
    });
  });

  it('completes OAuth and reads only recruiting calendar events', async () => {
    const get = jest.fn((url: string) => {
      if (url.includes('/events/instance_view')) {
        return of({
          data: {
            code: 0,
            data: {
              items: [
                {
                  event_id: 'exam-event',
                  summary: '示例公司－岗位胜任力测评',
                  start_time: { timestamp: '1784721600' },
                  end_time: { timestamp: '1784728800' },
                },
                {
                  event_id: 'lunch-event',
                  summary: '午餐',
                  start_time: { timestamp: '1784721600' },
                  end_time: { timestamp: '1784725200' },
                },
              ],
            },
          },
        });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    const post = jest.fn((url: string, body?: { [key: string]: string }) => {
      if (url.endsWith('/calendar/v4/calendars/primary')) {
        return of({
          data: {
            code: 0,
            data: {
              calendars: [{ calendar: { calendar_id: 'primary-calendar' } }],
            },
          },
        });
      }
      if (url.endsWith('/authen/v2/oauth/token')) {
        if (body?.grant_type === 'authorization_code') {
          expect(body.code).toBe('authorization+code');
        } else {
          expect(body?.refresh_token).toBe('refresh-token');
        }
        return of({
          data: {
            code: 0,
            access_token: 'user-token',
            expires_in: 7200,
            refresh_token: 'refresh-token',
            refresh_token_expires_in: 604800,
          },
        });
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const service: WorkbenchCalendarService = new WorkbenchCalendarService({
      get,
      post,
    } as unknown as HttpService);

    const disconnected: CalendarLoadResult =
      await service.getCalendar('', 'miaoda-user');
    const authorizationUrl: URL = new URL(
      String(disconnected.response.authorizationUrl),
    );
    const state: string = String(authorizationUrl.searchParams.get('state'));
    const oauth: CalendarOAuthResult = await service.completeOAuth(
      'authorization code',
      state,
      `${service.getStateCookieName()}=${disconnected.stateCookie}`,
    );
    const tokenCookieHeader: string = oauth.tokenCookieParts
      .map(
        (part: string, index: number): string =>
          `${service.getTokenCookieNames()[index]}=${part}`,
      )
      .join('; ');
    const connected: CalendarLoadResult = await service.getCalendar(
      tokenCookieHeader,
      'miaoda-user',
    );
    const response: WorkbenchCalendarResponse = connected.response;

    expect(disconnected.response.connected).toBe(false);
    expect(authorizationUrl.searchParams.get('scope')).toContain(
      'calendar:calendar.event:read',
    );
    expect(authorizationUrl.searchParams.get('scope')).toContain(
      'calendar:calendar:readonly',
    );
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'https://example.com/app/app_test/calendar-oauth-callback',
    );
    expect(response.connected).toBe(true);
    expect(oauth.tokenCookieParts.every(
      (part: string): boolean => part.length <= 3000,
    )).toBe(true);
    expect(response.events).toHaveLength(1);
    expect(response.events[0].eventId).toBe('exam-event');
  });
});
