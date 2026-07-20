export interface JobProgressSyncRequest {
  sourceRecordId: string;
  sourceRecordLink?: string;
  transitionedAt?: string;
}

export type JobProgressSyncAction = 'created' | 'updated' | 'unchanged';

export interface JobProgressSyncResponse {
  ok: true;
  action: JobProgressSyncAction;
  recordId: string;
}

export interface JobProgressHealthResponse {
  ok: true;
  service: 'job-progress-sync';
}
