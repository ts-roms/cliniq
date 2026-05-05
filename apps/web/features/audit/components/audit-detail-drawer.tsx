'use client';

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@org/ui';
import type { AuditFilter, AuditLogEntry } from '../schemas/audit';

interface Props {
  entry: AuditLogEntry | null;
  onClose: () => void;
  onApplyFilter: (filter: AuditFilter) => void;
}

export function AuditDetailDrawer({ entry, onClose, onApplyFilter }: Props) {
  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono text-base">{entry.action}</DialogTitle>
              <DialogDescription>
                {new Date(entry.occurredAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>
            <DetailGrid entry={entry} />
            <FilterShortcuts entry={entry} onApply={onApplyFilter} onClose={onClose} />
            <MetadataBlock metadata={entry.metadata} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailGrid({ entry }: { entry: AuditLogEntry }) {
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
      <Field label="Actor" value={entry.actorEmail ?? entry.userId} mono />
      <Field label="Tenant" value={entry.tenantId} mono />
      <Field label="Entity" value={entry.entityType ? `${entry.entityType}` : null} />
      <Field label="Entity ID" value={entry.entityId} mono />
      <Field label="IP" value={entry.ip} mono />
      <Field label="User agent" value={entry.userAgent} truncate />
    </dl>
  );
}

function Field({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={[
          'text-sm',
          mono ? 'font-mono text-xs' : '',
          truncate ? 'truncate' : 'break-words',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </>
  );
}

function FilterShortcuts({
  entry,
  onApply,
  onClose,
}: {
  entry: AuditLogEntry;
  onApply: (f: AuditFilter) => void;
  onClose: () => void;
}) {
  const apply = (filter: AuditFilter) => {
    onApply(filter);
    onClose();
  };
  return (
    <div className="flex flex-wrap gap-2 border-t pt-3">
      {entry.userId && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => apply({ userId: entry.userId!, cursor: 0 })}
        >
          All by this actor
        </Button>
      )}
      {entry.entityId && entry.entityType && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            apply({
              entityType: entry.entityType!,
              entityId: entry.entityId!,
              cursor: 0,
            })
          }
        >
          All on this {entry.entityType.toLowerCase()}
        </Button>
      )}
      {entry.action.includes('.') && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            apply({ action: `${entry.action.split('.')[0]}.`, cursor: 0 })
          }
        >
          All {entry.action.split('.')[0]}.* actions
        </Button>
      )}
    </div>
  );
}

function MetadataBlock({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return (
      <p className="border-t pt-3 text-xs text-muted-foreground">No metadata recorded.</p>
    );
  }
  return (
    <div className="border-t pt-3">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        Metadata
      </p>
      <pre className="max-h-64 overflow-auto rounded border bg-muted/30 p-3 text-xs">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </div>
  );
}
