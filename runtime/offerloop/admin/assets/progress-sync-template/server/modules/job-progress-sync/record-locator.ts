import type { JobProgressSyncRequest } from '@shared/api.interface';

export function extractRecordId(body: JobProgressSyncRequest): string {
  const candidates: string[] = [body?.sourceRecordId, body?.sourceRecordLink]
    .map((value: string | undefined): string => String(value ?? '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (/^rec[A-Za-z0-9]+$/u.test(candidate)) {
      return candidate;
    }
    try {
      const url: URL = new URL(candidate);
      for (const key of ['record', 'recordId', 'record_id']) {
        const value: string = String(url.searchParams.get(key) ?? '').trim();
        if (/^rec[A-Za-z0-9]+$/u.test(value)) {
          return value;
        }
      }
    } catch {
      // A non-URL candidate may still contain a record ID copied from Feishu.
    }
    const match: RegExpMatchArray | null = candidate.match(/\b(rec[A-Za-z0-9]+)\b/u);
    if (match) {
      return match[1];
    }
  }
  return '';
}
