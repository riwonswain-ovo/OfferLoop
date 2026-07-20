import * as React from 'react';

import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@client/src/components/ui/tooltip';

export interface OverflowTooltipTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  text: string;
}

/**
 * Displays truncated inline text and shows a tooltip with the full content when overflowed.
 */
export function OverflowTooltipText({
  text,
  className,
  ...props
}: OverflowTooltipTextProps) {
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  const checkOverflow = React.useCallback(() => {
    const el = textRef.current;
    if (!el) {
      return;
    }

    setIsOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, []);

  React.useLayoutEffect(() => {
    checkOverflow();
  }, [checkOverflow]);

  React.useEffect(() => {
    const el = textRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => {
      checkOverflow();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [checkOverflow]);

  React.useEffect(() => {
    const handleResize = () => {
      checkOverflow();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [checkOverflow]);

  const textNode = (
    <span
      ref={textRef}
      className={cn('inline-block truncate', className)}
      {...props}
    >
      {text}
    </span>
  );

  if (!isOverflowing) {
    return textNode;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={80}>
        <TooltipTrigger asChild>{textNode}</TooltipTrigger>
        <TooltipContent
          sideOffset={4}
          className="bg-[rgb(31,35,41)] text-white ring-0"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
