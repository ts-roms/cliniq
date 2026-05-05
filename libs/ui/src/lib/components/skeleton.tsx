import { cn } from '../utils';

/**
 * A subtle pulsing block — drop in place of text/value while data loads.
 * Use width/height utility classes to size it (e.g. `h-4 w-24`). Avoid
 * trying to perfectly mimic the final layout — a few representative
 * blocks read better than a pixel-perfect ghost.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden
      {...props}
    />
  );
}
