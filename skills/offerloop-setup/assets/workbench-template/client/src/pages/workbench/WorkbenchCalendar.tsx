import React, { useMemo } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarDays, ExternalLink, Link2 } from 'lucide-react';

import type {
  WorkbenchCalendarEvent,
  WorkbenchCalendarResponse,
} from '@shared/api.interface';

import { Button } from '@client/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Skeleton } from '@client/src/components/ui/skeleton';

interface CalendarDay {
  date: Dayjs;
  events: WorkbenchCalendarEvent[];
}

interface WorkbenchCalendarProps {
  calendar: WorkbenchCalendarResponse | null;
  calendarSourceUrl: string;
  loading: boolean;
}

const WorkbenchCalendar: React.FC<WorkbenchCalendarProps> = ({
  calendar,
  calendarSourceUrl,
  loading,
}) => {
  const days: CalendarDay[] = useMemo(() => {
    const start: Dayjs = dayjs().startOf('day');
    return Array.from({ length: 7 }, (_value: unknown, index: number) => {
      const date: Dayjs = start.add(index, 'day');
      const events: WorkbenchCalendarEvent[] = (calendar?.events ?? []).filter(
        (event: WorkbenchCalendarEvent): boolean => {
          const eventDate: Dayjs = dayjs(event.startAt);
          return eventDate.isValid() && eventDate.isSame(date, 'day');
        },
      );
      return { date, events };
    });
  }, [calendar]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-xl">
              <CalendarDays className="size-5 text-primary" />
              未来 7 天笔试与面试
            </CardTitle>
            <CardDescription>
              来自飞书个人日历，仅展示笔试、测评与面试日程
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {!loading && !calendar?.connected && calendar?.authorizationUrl ? (
              <Button asChild size="sm">
                <a
                  href={calendar.authorizationUrl}
                  target="_blank"
                  rel="noopener"
                >
                  <Link2 />
                  连接飞书日历
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href={calendarSourceUrl} target="_blank" rel="noreferrer">
                打开日历 Base
                <ExternalLink />
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <>
            {calendar?.message ? (
              <p className="mb-3 text-sm text-muted-foreground">
                {calendar.message}
              </p>
            ) : null}
            <div className="grid min-h-[300px] grid-cols-1 overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-7">
              {days.map((day: CalendarDay) => (
                <div
                  key={day.date.format('YYYY-MM-DD')}
                  className="min-h-40 border-b p-3 last:border-b-0 sm:border-r lg:border-b-0"
                >
                  <div className="mb-3 flex items-center justify-between gap-2 lg:block">
                    <p className="text-xs text-muted-foreground">
                      {day.date.format('ddd')}
                    </p>
                    <p className={`text-lg font-semibold ${day.date.isSame(dayjs(), 'day') ? 'text-primary' : ''}`}>
                      {day.date.format('M/D')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {day.events.length === 0 ? (
                      <p className="pt-3 text-xs text-muted-foreground">
                        暂无安排
                      </p>
                    ) : day.events.map((event: WorkbenchCalendarEvent) => {
                      const content: React.ReactNode = (
                        <>
                          <p className="truncate text-sm font-medium">
                            {event.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {event.isAllDay
                              ? '全天'
                              : dayjs(event.startAt).format('HH:mm')}
                          </p>
                        </>
                      );
                      const className: string =
                        'block rounded-lg border-l-4 border-l-primary bg-accent p-2';
                      return event.url ? (
                        <a
                          key={event.eventId}
                          href={event.url}
                          target="_blank"
                          rel="noreferrer"
                          className={className}
                        >
                          {content}
                        </a>
                      ) : (
                        <div key={event.eventId} className={className}>
                          {content}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export { WorkbenchCalendar };
