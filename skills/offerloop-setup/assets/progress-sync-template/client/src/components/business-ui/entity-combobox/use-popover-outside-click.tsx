import { useEffect } from 'react';

/**
 * 处理点击外部关闭浮层的 Hook
 * 仅在 search 模式下使用
 */
export function usePopoverOutsideClick(
  open: boolean,
  enabled: boolean,
  popoverRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open || !enabled) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        triggerRef.current &&
        !popoverRef.current.contains(target) &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, enabled, popoverRef, triggerRef, onClose]);
}
