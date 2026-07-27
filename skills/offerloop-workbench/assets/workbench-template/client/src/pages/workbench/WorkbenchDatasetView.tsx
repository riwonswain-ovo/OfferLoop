import React from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { ExternalLink } from 'lucide-react';

import type {
  BaseCellValue,
  WorkbenchDataset,
  WorkbenchRecord,
} from '@shared/api.interface';

import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/src/components/ui/table';

import { extractLinkTargets } from './link-value';
import { getWorkbenchPageCount } from './pagination';

interface DatasetColumn {
  key: string;
  label: string;
  width?: string;
}

interface DatasetViewProps {
  dataset: WorkbenchDataset;
  page: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

interface WorkbenchTableProps extends DatasetViewProps {
  columns: DatasetColumn[];
}

const COMPANY_COLUMNS: DatasetColumn[] = [
  { key: '投递进度', label: '进度' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '招聘批次', label: '批次' },
  { key: '招聘项目', label: '招聘项目', width: 'min-w-40' },
  { key: '招聘岗位', label: '招聘岗位', width: 'min-w-52' },
  { key: '城市', label: '城市' },
  { key: '企业性质', label: '企业性质' },
  { key: '投递截止时间', label: '截止时间' },
  { key: '投递链接', label: '投递入口' },
];

const PROGRESS_COLUMNS: DatasetColumn[] = [
  { key: '当前阶段', label: '当前阶段' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '投递岗位', label: '投递岗位', width: 'min-w-48' },
  { key: '投递日期', label: '投递日期' },
  { key: '岗位 JD', label: '岗位 JD', width: 'min-w-64' },
  { key: '公告链接', label: '公告入口' },
  { key: '投递链接', label: '投递入口' },
];

const EVENT_COLUMNS: DatasetColumn[] = [
  { key: '环节', label: '环节' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '岗位', label: '岗位', width: 'min-w-44' },
  { key: '开始时间', label: '开始时间' },
  { key: '截止时间', label: '截止时间' },
  { key: '完成状态', label: '状态' },
  { key: '链接', label: '入口' },
  { key: '面试准备文档', label: '准备文档' },
  { key: '面试复盘文档', label: '复盘文档' },
];

const EXAM_COLUMNS: DatasetColumn[] = [
  { key: '完成状态', label: '状态' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '岗位', label: '岗位', width: 'min-w-44' },
  { key: '笔试类型', label: '笔试类型' },
  { key: '笔试子类型', label: '形式' },
  { key: '开始时间', label: '开始时间' },
  { key: '截止时间', label: '截止时间' },
  { key: '链接', label: '入口' },
];

const INTERVIEW_COLUMNS: DatasetColumn[] = [
  { key: '完成状态', label: '状态' },
  { key: '公司', label: '公司', width: 'min-w-36' },
  { key: '岗位', label: '岗位', width: 'min-w-44' },
  { key: '开始时间', label: '开始时间' },
  { key: '截止时间', label: '截止时间' },
  { key: '链接', label: '入口' },
  { key: '面试准备文档', label: '准备文档' },
  { key: '面试复盘文档', label: '复盘文档' },
];

const PROGRESS_STAGE_ORDER: string[] = [
  '已投递',
  '笔试',
  '群面',
  '一面',
  '二面',
  '三面',
  'HR面',
  'Offer',
  '已结束',
];

const LINK_FIELDS: string[] = [
  '公告链接',
  '投递链接',
  '链接',
  '面试准备文档',
  '面试复盘文档',
];

const DATE_FIELDS: string[] = [
  '信息更新时间',
  '投递日期',
  '开始时间',
  '结束时间',
  '截止时间',
];

const cellToText = (value: BaseCellValue | undefined): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  if (Array.isArray(value)) {
    return value.map((item: BaseCellValue): string => cellToText(item)).join('、');
  }
  const preferredValue: BaseCellValue | undefined =
    value.text ?? value.name ?? value.link ?? value.url;
  if (preferredValue !== undefined) {
    return cellToText(preferredValue);
  }
  return Object.values(value)
    .map((item: BaseCellValue): string => cellToText(item))
    .filter((item: string): boolean => Boolean(item))
    .join('、');
};

const cellToDate = (value: BaseCellValue | undefined): Dayjs | null => {
  if (typeof value === 'number') {
    const parsed: Dayjs = dayjs(value);
    return parsed.isValid() ? parsed : null;
  }
  const text: string = cellToText(value).trim();
  if (!text) {
    return null;
  }
  const numericValue: number = Number(text);
  const parsed: Dayjs = Number.isFinite(numericValue) && text.length >= 10
    ? dayjs(numericValue)
    : dayjs(text);
  return parsed.isValid() ? parsed : null;
};

const cellToDisplayText = (
  fieldName: string,
  value: BaseCellValue | undefined,
): string => {
  if (!DATE_FIELDS.includes(fieldName)) {
    return cellToText(value);
  }
  const parsed: Dayjs | null = cellToDate(value);
  if (!parsed) {
    return cellToText(value);
  }
  const hasTime: boolean = parsed.hour() !== 0
    || parsed.minute() !== 0
    || parsed.second() !== 0;
  return parsed.format(hasTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD');
};

const DatasetPager: React.FC<DatasetViewProps> = ({
  dataset,
  page,
  loading,
  onPageChange,
}) => {
  const pageCount: number = getWorkbenchPageCount(dataset.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        共 {dataset.total} 条 · 第 {page} / {pageCount} 页 · 每页 30 条
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page >= pageCount || !dataset.hasMore}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
};

const WorkbenchTable: React.FC<WorkbenchTableProps> = ({
  dataset,
  columns,
  page,
  loading,
  onPageChange,
}) => (
  <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column: DatasetColumn) => (
            <TableHead key={column.key} className={column.width}>
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {dataset.records.map((record: WorkbenchRecord) => (
          <TableRow key={record.recordId}>
            {columns.map((column: DatasetColumn) => {
              const value: BaseCellValue | undefined = record.fields[column.key];
              const text: string = cellToDisplayText(column.key, value);
              const linkTargets: string[] = LINK_FIELDS.includes(column.key)
                ? extractLinkTargets(value)
                : [];
              const isBadge: boolean = [
                '投递进度',
                '当前阶段',
                '环节',
                '完成状态',
              ].includes(column.key);
              return (
                <TableCell
                  key={`${record.recordId}-${column.key}`}
                  className={`${column.width ?? ''} max-w-72`}
                >
                  {linkTargets.length > 0 ? (
                    <span className="flex flex-wrap gap-2">
                      {linkTargets.map((target: string, index: number) => (
                        <a
                          key={`${target}-${index}`}
                          href={target}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {linkTargets.length > 1 ? `打开 ${index + 1}` : '打开'}
                          <ExternalLink className="size-3.5" />
                        </a>
                      ))}
                    </span>
                  ) : isBadge && text ? (
                    <Badge variant="secondary">{text}</Badge>
                  ) : (
                    <span className="block truncate" title={text}>
                      {text || '—'}
                    </span>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <DatasetPager
      dataset={dataset}
      page={page}
      loading={loading}
      onPageChange={onPageChange}
    />
  </div>
);

const ProgressKanban: React.FC<DatasetViewProps> = ({
  dataset,
  page,
  loading,
  onPageChange,
}) => {
  const groupedRecords: Map<string, WorkbenchRecord[]> = new Map();
  dataset.records.forEach((record: WorkbenchRecord): void => {
    const stage: string = cellToText(record.fields['当前阶段']) || '待确认';
    groupedRecords.set(stage, [...(groupedRecords.get(stage) ?? []), record]);
  });
  const stages: string[] = [
    ...PROGRESS_STAGE_ORDER.filter(
      (stage: string): boolean => groupedRecords.has(stage),
    ),
    ...Array.from(groupedRecords.keys()).filter(
      (stage: string): boolean => !PROGRESS_STAGE_ORDER.includes(stage),
    ),
  ];
  return (
    <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {stages.map((stage: string) => {
          const records: WorkbenchRecord[] = groupedRecords.get(stage) ?? [];
          return (
            <div key={stage} className="w-72 shrink-0 rounded-xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <Badge variant="secondary">{stage}</Badge>
                <span className="text-sm text-muted-foreground">
                  {records.length}
                </span>
              </div>
              <div className="space-y-2">
                {records.map((record: WorkbenchRecord) => (
                  <div
                    key={record.recordId}
                    className="rounded-lg border bg-background p-3 shadow-sm"
                  >
                    <p className="font-medium">
                      {cellToText(record.fields['公司']) || '未命名公司'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {cellToText(record.fields['投递岗位']) || '投递岗位待填写'}
                    </p>
                    {cellToDisplayText('投递日期', record.fields['投递日期']) ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        投递于 {cellToDisplayText(
                          '投递日期',
                          record.fields['投递日期'],
                        )}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <DatasetPager
        dataset={dataset}
        page={page}
        loading={loading}
        onPageChange={onPageChange}
      />
    </div>
  );
};

export {
  COMPANY_COLUMNS,
  EVENT_COLUMNS,
  EXAM_COLUMNS,
  INTERVIEW_COLUMNS,
  PROGRESS_COLUMNS,
  ProgressKanban,
  WorkbenchTable,
};
