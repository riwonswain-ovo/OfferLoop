import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  BookOpenText,
  ExternalLink,
  Newspaper,
  RefreshCw,
  Rss,
} from 'lucide-react';

import type {
  KnowledgeDigestResponse,
  KnowledgeDigestSource,
  KnowledgeDigestSummary,
} from '@shared/api.interface';

import { getKnowledgeDigest } from '@client/src/api';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Progress } from '@client/src/components/ui/progress';
import { Skeleton } from '@client/src/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';

const formatTime = (value?: string): string =>
  value && dayjs(value).isValid()
    ? dayjs(value).format('M 月 D 日 HH:mm')
    : '尚未同步';

const formatDate = (value?: string): string =>
  value && dayjs(value).isValid() ? dayjs(value).format('YYYY 年 M 月 D 日') : '待排期';

const SummaryCard: React.FC<{ summary: KnowledgeDigestSummary }> = ({
  summary,
}) => (
  <article className="rounded-xl border bg-background p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{summary.sourceType}</Badge>
          {summary.sourceName ? (
            <span className="text-xs text-muted-foreground">
              {summary.sourceName}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {formatTime(summary.publishedAt)}
          </span>
        </div>
        <h3 className="text-base font-semibold leading-6">{summary.title}</h3>
        <p className="text-sm font-medium leading-6 text-foreground">
          {summary.conclusion || '摘要正在补充中'}
        </p>
      </div>
      <Badge variant="outline">{summary.status}</Badge>
    </div>

    {summary.keyPoints.length > 0 ? (
      <ol className="mt-3 space-y-1.5 text-sm leading-6 text-muted-foreground">
        {summary.keyPoints.map((point: string, index: number) => (
          <li key={`${summary.recordId}-${index}`} className="flex gap-2">
            <span className="font-medium text-primary">{index + 1}.</span>
            <span>{point}</span>
          </li>
        ))}
      </ol>
    ) : null}

    {summary.tags.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {summary.tags.map((tag: string) => (
          <Badge key={tag} variant="outline">{tag}</Badge>
        ))}
      </div>
    ) : null}

    <div className="mt-4 flex flex-wrap gap-2">
      {summary.documentUrl ? (
        <Button asChild size="sm">
          <a href={summary.documentUrl} target="_blank" rel="noreferrer">
            <BookOpenText />
            完整摘要
          </a>
        </Button>
      ) : null}
      {summary.sourceUrl ? (
        <Button asChild size="sm" variant="outline">
          <a href={summary.sourceUrl} target="_blank" rel="noreferrer">
            <ExternalLink />
            原文
          </a>
        </Button>
      ) : null}
    </div>
  </article>
);

const SourceRow: React.FC<{ source: KnowledgeDigestSource }> = ({ source }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{source.name}</span>
        <Badge variant="secondary">{source.mode}</Badge>
        <Badge variant="outline">{source.type || '未分类'}</Badge>
        {!source.enabled ? <Badge variant="secondary">已暂停</Badge> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        最近成功：{formatTime(source.lastSyncedAt)}
        {source.message ? ` · ${source.message}` : ''}
      </p>
      {source.interests.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          关注：{source.interests.join('、')}
        </p>
      ) : null}
    </div>
    <Badge variant={source.status === '正常' ? 'secondary' : 'outline'}>
      {source.status}
    </Badge>
  </div>
);

const LibraryProgress: React.FC<{ source: KnowledgeDigestSource }> = ({
  source,
}) => {
  const completed = Math.min(source.completedItems, source.totalItems);
  const percent = source.totalItems > 0
    ? Math.round((completed / source.totalItems) * 100)
    : 0;
  return (
    <article className="space-y-4 rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{source.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            已读 {completed} / {source.totalItems} 篇 · 预计 {formatDate(source.targetDate)} 完成
          </p>
        </div>
        <Badge variant="outline">{percent}%</Badge>
      </div>
      <Progress value={percent} />
      <div className="rounded-lg bg-muted/50 p-3">
        <p className="text-xs font-medium text-muted-foreground">下一批</p>
        <p className="mt-1 text-sm leading-6">
          {source.nextBatch || '等待 Agent 完成全量盘点并生成阅读计划。'}
        </p>
      </div>
      {source.planUrl ? (
        <Button asChild size="sm" variant="outline">
          <a href={source.planUrl} target="_blank" rel="noreferrer">
            <BookOpenText />
            查看阅读计划
          </a>
        </Button>
      ) : null}
    </article>
  );
};

export const KnowledgeDigestCard: React.FC = () => {
  const [data, setData] = useState<KnowledgeDigestResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      setData(await getKnowledgeDigest());
    } catch (_error: unknown) {
      setError('知识速览暂时无法读取，不影响其他工作台数据。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const libraries: KnowledgeDigestSource[] = (data?.sources ?? []).filter(
    (source: KnowledgeDigestSource): boolean =>
      source.mode === '知识库' || source.mode === '混合',
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Newspaper className="size-5 text-primary" />
              知识速览
            </CardTitle>
            <CardDescription>
              梳理知识库全貌和阅读进度，并追踪兴趣范围内的新增新闻
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {data?.baseUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={data.baseUrl} target="_blank" rel="noreferrer">
                  打开 Base
                  <ExternalLink />
                </a>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void load(); }}
              disabled={loading}
            >
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              刷新
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !data?.configured ? (
          <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
            <Rss className="mx-auto mb-3 size-8 text-primary" />
            <p className="font-medium">还没有登记知识来源</p>
            <p className="mt-1 text-sm text-muted-foreground">
              对 Agent 说“帮我读完这个知识库”或“订阅这个新闻网站”。
            </p>
          </div>
        ) : (
          <Tabs defaultValue={libraries.length > 0 ? 'libraries' : 'summaries'}>
            <TabsList className="mb-4">
              <TabsTrigger value="libraries">
                知识库进度 · {libraries.length}
              </TabsTrigger>
              <TabsTrigger value="summaries">
                最新动态 · {data.summaries.length}
              </TabsTrigger>
              <TabsTrigger value="sources">
                信息源 · {data.sources.length}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="libraries">
              {libraries.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {libraries.map((source: KnowledgeDigestSource) => (
                    <LibraryProgress key={source.recordId} source={source} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  尚无已盘点的知识库。
                </div>
              )}
            </TabsContent>
            <TabsContent value="summaries">
              {data.summaries.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {data.summaries.slice(0, 6).map(
                    (summary: KnowledgeDigestSummary) => (
                      <SummaryCard key={summary.recordId} summary={summary} />
                    ),
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {data.message || '等待第一次知识盘点或新闻增量同步。'}
                </div>
              )}
            </TabsContent>
            <TabsContent value="sources">
              {data.sources.length > 0 ? (
                <div className="space-y-3">
                  {data.sources.map((source: KnowledgeDigestSource) => (
                    <SourceRow key={source.recordId} source={source} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  尚无已登记的信息源。
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
