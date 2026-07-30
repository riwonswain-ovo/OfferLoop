import React from 'react';
import { FileSearch } from 'lucide-react';

import { Badge } from '@client/src/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';

const RESUME_DEEP_DIVE_SLOTS: number[] = [1, 2, 3, 4, 5];

const ResumeDeepDiveCard: React.FC = () => (
  <Card data-ai-section-type="card-list">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileSearch className="size-5 text-primary" />
            简历深挖
          </CardTitle>
          <CardDescription>
            真实问题将在简历深挖 Skill 接入简历素材后生成
          </CardDescription>
        </div>
        <Badge variant="secondary">5 题</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-2">
      {RESUME_DEEP_DIVE_SLOTS.map((slot: number) => (
        <div
          key={slot}
          className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
        >
          第 {slot} 题将在简历深挖 Skill 启用后生成
        </div>
      ))}
    </CardContent>
  </Card>
);

export { ResumeDeepDiveCard };
