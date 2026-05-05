import { memo } from 'react';
import { Card } from '@org/ui';
import type { AuditLogEntry } from '../schemas/audit';

interface Props {
  items: AuditLogEntry[];
  onSelect?: (entry: AuditLogEntry) => void;
}

export const AuditTable = memo(function AuditTable({ items, onSelect }: Props) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
        <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-6 py-3">When</th>
            <th className="px-6 py-3">Action</th>
            <th className="px-6 py-3">Actor</th>
            <th className="px-6 py-3">Entity</th>
            <th className="px-6 py-3">IP</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <AuditRow key={row.id} row={row} onSelect={onSelect} />
          ))}
        </tbody>
        </table>
      </div>
    </Card>
  );
});

interface RowProps {
  row: AuditLogEntry;
  onSelect?: (entry: AuditLogEntry) => void;
}

const AuditRow = memo(function AuditRow({ row, onSelect }: RowProps) {
  const interactive = !!onSelect;
  return (
    <tr
      onClick={interactive ? () => onSelect!(row) : undefined}
      className={[
        'border-b last:border-0 align-top',
        interactive ? 'cursor-pointer hover:bg-muted/40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <td className="px-6 py-3 tabular-nums text-xs text-muted-foreground">
        {new Date(row.occurredAt).toLocaleString()}
      </td>
      <td className="px-6 py-3">
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
          {row.action}
        </span>
      </td>
      <td className="px-6 py-3 text-xs">{row.actorEmail ?? row.userId ?? '—'}</td>
      <td className="px-6 py-3 text-xs">
        {row.entityType ? (
          <>
            <span>{row.entityType}</span>
            {row.entityId && (
              <span className="ml-1 font-mono text-muted-foreground">
                {row.entityId.slice(0, 8)}…
              </span>
            )}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
        {row.ip ?? '—'}
      </td>
    </tr>
  );
});
