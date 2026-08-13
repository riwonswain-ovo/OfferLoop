import React from 'react';
import {
  ArrowRight,
  CircleUserRound,
  NotebookPen,
} from 'lucide-react';

import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';

const NOTEBOOK_LM_URL = 'http://127.0.0.1:39002/';

const NotebookLmCard: React.FC = () => (
  <Card className="overflow-hidden border-blue-200/70 bg-gradient-to-br from-blue-50/90 via-background to-amber-50/70">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <NotebookPen className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg">NotebookLM</CardTitle>
            <CardDescription>在飞书中使用本机私人 Chromium</CardDescription>
          </div>
        </div>
        <Badge variant="secondary">Google 账号</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-white/70 p-3 text-sm text-muted-foreground">
        <CircleUserRound className="mt-0.5 size-4 shrink-0 text-blue-600" />
        <p>
          Google 登录保存在你的 Mac；进入后使用的仍是官方 NotebookLM 网页。
        </p>
      </div>
      <Button asChild className="w-full">
        <a
          href={NOTEBOOK_LM_URL}
          referrerPolicy="no-referrer"
          data-ai-section-type="button"
        >
          在飞书内打开私人 NotebookLM
          <ArrowRight />
        </a>
      </Button>
    </CardContent>
  </Card>
);

export {
  NOTEBOOK_LM_URL,
  NotebookLmCard,
};
