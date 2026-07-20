const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'、，。；）)]+/g;

const collectHttpUrls = (value: unknown, urls: string[]): void => {
  if (typeof value === 'string') {
    const matches: string[] = value.match(HTTP_URL_PATTERN) ?? [];
    matches.forEach((candidate: string) => {
      try {
        const parsed: URL = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          urls.push(parsed.toString());
        }
      } catch (_error: unknown) {
        // Ignore display text and malformed values that are not real URLs.
      }
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item: unknown) => collectHttpUrls(item, urls));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const record: Record<string, unknown> = value as Record<string, unknown>;
  const directTargets: unknown[] = [record.link, record.url, record.href].filter(
    (target: unknown): boolean => target !== undefined && target !== null,
  );
  const targets: unknown[] = directTargets.length > 0
    ? directTargets
    : Object.values(record);
  targets.forEach((target: unknown) => collectHttpUrls(target, urls));
};

export const extractLinkTargets = (value: unknown): string[] => {
  const urls: string[] = [];
  collectHttpUrls(value, urls);
  return [...new Set(urls)];
};
