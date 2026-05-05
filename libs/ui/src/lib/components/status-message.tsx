import { cn } from '../utils';

/**
 * Standardized loading + error blocks for inside cards and lists. Keeps the
 * visual treatment distinct so users tell them apart at a glance:
 *
 *  <Loading />               → soft muted with spinner glyph
 *  <ErrorMessage error={e} /> → red border + alert icon
 *
 * Both render compact by default; pass `block` for a centered, padded
 * version when used as an empty-card fallback.
 */
export function Loading({
  label = 'Loading…',
  block = false,
  className,
}: {
  label?: string;
  block?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm text-muted-foreground',
        block && 'justify-center px-4 py-6',
        className,
      )}
      role="status"
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function ErrorMessage({
  error,
  block = false,
  className,
}: {
  error: unknown;
  block?: boolean;
  className?: string;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Something went wrong';
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive',
        block && 'justify-center text-center',
        className,
      )}
    >
      <AlertGlyph />
      <span className="leading-snug">{message}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

function AlertGlyph() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
