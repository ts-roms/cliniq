'use client';

import { Button, Input, Select } from '@org/ui';
import type { AuditFilter } from '../schemas/audit';

// Keep this list in sync with the @Audit({ action: '...' }) calls scattered
// across the api modules. Used as a quick-pick — users can also type free-form.
const ACTION_PREFIXES = [
  '',
  'auth.',
  'patient.',
  'consult.',
  'rx.',
  'ai.',
  'file.',
  'appointment.',
  'allergy.',
  'medication.',
  'condition.',
  'vital.',
  'service.',
  'invoice.',
  'payment.',
  'inventory.',
  'lab.',
  'hmo.',
  'dsr.',
  'tele.',
  'tenant.',
];

const QUICK_RANGES: Array<{ label: string; minutes: number }> = [
  { label: 'Last 1h', minutes: 60 },
  { label: 'Last 24h', minutes: 60 * 24 },
  { label: 'Last 7d', minutes: 60 * 24 * 7 },
  { label: 'Last 30d', minutes: 60 * 24 * 30 },
];

function isoLocalNow(): string {
  // For <input type="datetime-local"> — local clock, no timezone suffix.
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoLocalAgo(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  filter: AuditFilter;
  onChange: (next: AuditFilter) => void;
}

export function AuditFilters({ filter, onChange }: Props) {
  const isFiltered =
    !!filter.action ||
    !!filter.entityType ||
    !!filter.entityId ||
    !!filter.userId ||
    !!filter.since ||
    !!filter.until;

  const setRange = (minutes: number) =>
    onChange({
      ...filter,
      since: isoLocalAgo(minutes),
      until: isoLocalNow(),
      cursor: 0,
    });

  return (
    <div className="mb-4 space-y-2 rounded-lg border bg-card p-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Action</p>
          <Select
            value={filter.action ?? ''}
            onChange={(e) => onChange({ ...filter, action: e.target.value, cursor: 0 })}
          >
            {ACTION_PREFIXES.map((p) => (
              <option key={p} value={p}>
                {p === '' ? 'All actions' : `${p}*`}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Entity type</p>
          <Input
            value={filter.entityType ?? ''}
            onChange={(e) =>
              onChange({ ...filter, entityType: e.target.value || undefined, cursor: 0 })
            }
            placeholder="e.g. Patient"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Entity ID</p>
          <Input
            value={filter.entityId ?? ''}
            onChange={(e) =>
              onChange({ ...filter, entityId: e.target.value || undefined, cursor: 0 })
            }
            placeholder="cl..."
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Actor user ID</p>
          <Input
            value={filter.userId ?? ''}
            onChange={(e) =>
              onChange({ ...filter, userId: e.target.value || undefined, cursor: 0 })
            }
            placeholder="cl..."
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Since</p>
          <Input
            type="datetime-local"
            value={filter.since ?? ''}
            onChange={(e) =>
              onChange({ ...filter, since: e.target.value || undefined, cursor: 0 })
            }
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Until</p>
          <Input
            type="datetime-local"
            value={filter.until ?? ''}
            onChange={(e) =>
              onChange({ ...filter, until: e.target.value || undefined, cursor: 0 })
            }
          />
        </div>
        <div className="md:col-span-2">
          <p className="mb-1 text-xs text-muted-foreground">Quick range</p>
          <div className="flex flex-wrap gap-1">
            {QUICK_RANGES.map((r) => (
              <Button
                key={r.label}
                size="sm"
                variant="outline"
                type="button"
                onClick={() => setRange(r.minutes)}
              >
                {r.label}
              </Button>
            ))}
            {isFiltered && (
              <Button
                size="sm"
                variant="ghost"
                type="button"
                className="text-destructive hover:text-destructive"
                onClick={() =>
                  onChange({ limit: filter.limit ?? 50, cursor: 0 })
                }
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
