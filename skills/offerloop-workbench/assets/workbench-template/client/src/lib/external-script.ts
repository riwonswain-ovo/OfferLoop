import { useEffect, useState } from 'react';

export type ExternalScriptStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseExternalScriptOptions {
  removeOnUnmount?: boolean;
  attributes?: Record<string, string>;
  nonce?: string;
  onloadCallback?: () => void;
}

export function useExternalScript(
  src: string,
  options: UseExternalScriptOptions = {},
): ExternalScriptStatus {
  const [status, setStatus] = useState<ExternalScriptStatus>('idle');

  useEffect(() => {
    if (!src) return;

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      queueMicrotask(() => {
        setStatus('ready');
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStatus('loading');
    });
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    if (options.nonce) script.nonce = options.nonce;
    Object.entries(options.attributes ?? {}).forEach(([key, value]) => {
      script.setAttribute(key, value);
    });

    script.onload = () => {
      if (!cancelled) setStatus('ready');
      options.onloadCallback?.();
    };
    script.onerror = () => {
      if (!cancelled) setStatus('error');
    };

    document.body.append(script);
    return () => {
      cancelled = true;
      if (options.removeOnUnmount) {
        script.remove();
      }
    };
  }, [options, src]);

  return status;
}
