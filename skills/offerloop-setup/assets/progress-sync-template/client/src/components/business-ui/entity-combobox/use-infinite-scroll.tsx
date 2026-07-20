'use client';

import { useCallback, useEffect, useRef } from 'react';

export type UseInfiniteScrollOptions = {
  /**
   * 加载更多数据的回调函数
   */
  onLoadMore: () => void;
  /**
   * 是否还有更多数据
   */
  hasMore: boolean;
  /**
   * 是否正在加载中
   */
  isLoading: boolean;
  /**
   * 是否启用无限滚动
   * @default true
   */
  enabled?: boolean;
  /**
   * IntersectionObserver 的 threshold
   * @default 0.1
   */
  threshold?: number;
  /**
   * IntersectionObserver 的 rootMargin，用于提前触发加载
   * @default '50px'
   */
  rootMargin?: string;
};

export type UseInfiniteScrollResult = {
  /**
   * 绑定到触发元素的 ref
   */
  triggerRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * 无限滚动加载 hook
 * 使用 IntersectionObserver 检测滚动触底，自动触发加载更多
 *
 * @example
 * ```tsx
 * const { triggerRef } = useInfiniteScroll({
 *   onLoadMore: fetchMore,
 *   hasMore,
 *   isLoading: isFetchingMore,
 * })
 *
 * return (
 *   <ScrollArea>
 *     {items.map(item => <Item key={item.id} />)}
 *     <div ref={triggerRef} />
 *   </ScrollArea>
 * )
 * ```
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  enabled = true,
  threshold = 0.1,
  rootMargin = '50px',
}: UseInfiniteScrollOptions): UseInfiniteScrollResult {
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry?.isIntersecting && hasMore && !isLoading && enabled) {
        onLoadMore();
      }
    },
    [hasMore, isLoading, enabled, onLoadMore],
  );

  useEffect(() => {
    const element = triggerRef.current;
    if (!element || !enabled) return;

    const observer = new IntersectionObserver(handleIntersect, {
      threshold,
      rootMargin,
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [handleIntersect, threshold, rootMargin, enabled]);

  return { triggerRef };
}
