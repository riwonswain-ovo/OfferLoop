import { useEffect, useState } from 'react';

export type ExternalScriptStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseExternalScriptOptions {
  removeOnUnmount?: boolean;
  attributes?: Record<string, string>;
  nonce?: string;
  onloadCallback?: () => void;
}

/**
 * 在组件生命周期内按需注入外链脚本（追加到 <body> 末尾），并返回加载状态。
 * - 避免重复注入：如果页面已存在同 src 的脚本，直接标记为 ready。
 * - 支持 CSP：可通过 nonce 传入。
 * - 可选清理：removeOnUnmount=true 时卸载时移除脚本。
 */
export function useExternalScript(
  src: string,
  options: UseExternalScriptOptions = {},
): ExternalScriptStatus {
  const [status, setStatus] = useState<ExternalScriptStatus>('idle');

  useEffect(() => {
    if (!src) return;

    // 如果已经存在同 src 的脚本，直接认为已就绪
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      queueMicrotask(() => {
        setStatus('ready');
      });
      return;
    }
    // 在 effect 中避免同步 setState，使用微任务调度，防止级联渲染警告
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
    Object.entries(options.attributes ?? {}).forEach(([k, v]) => {
      script.setAttribute(k, v);
    });

    script.onload = () => {
      if (!cancelled) setStatus('ready');
      if (options.onloadCallback) {
        options.onloadCallback();
      }
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
