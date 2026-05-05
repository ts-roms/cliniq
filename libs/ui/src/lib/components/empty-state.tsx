import { cn } from '../utils';

/**
 * Standard "nothing here yet" block. Used inside Card content panels and on
 * full-list pages. Keep the icon optional — most cards don't need one.
 *
 * <EmptyState
 *   title="No allergies on file"
 *   description="Add one when the patient discloses something."
 *   action={<Button onClick={...}>Add allergy</Button>}
 * />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-2 text-muted-foreground" aria-hidden>
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
