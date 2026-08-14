export interface JobProgressSyncRequest {
  sourceRecordId: string;
  sourceRecordLink?: string;
  transitionedAt?: string;
}

export type JobProgressSyncAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'review_required'
  | 'unchanged';

export interface JobProgressSyncResponse {
  ok: true;
  action: JobProgressSyncAction;
  recordId: string;
  matchedCount?: number;
  deletedCount?: number;
  protectedCount?: number;
}

export interface JobProgressHealthResponse {
  ok: true;
  service: 'job-progress-sync';
}
