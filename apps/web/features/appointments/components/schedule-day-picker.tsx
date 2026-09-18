'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, DatePicker } from '@org/ui';

/** `YYYY-MM-DD` → local-midnight Date (avoid the UTC shift of `new Date(iso)`). */
function fromIsoDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Local Date → `YYYY-MM-DD` in the browser's timezone. */
function toIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftIso(iso: string, days: number): string {
  const d = fromIsoDay(iso);
  d.setDate(d.getDate() + days);
  return toIsoDay(d);
}

export function ScheduleDayPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9"
        aria-label="Previous day"
        onClick={() => onChange(shiftIso(value, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <DatePicker
        aria-label="Schedule date"
        value={fromIsoDay(value)}
        onChange={(d) => d && onChange(toIsoDay(d))}
        displayFormat="EEE, MMM d, yyyy"
        className="h-9 w-56"
      />
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9"
        aria-label="Next day"
        onClick={() => onChange(shiftIso(value, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChange(toIsoDay(new Date()))}
      >
        Today
      </Button>
    </div>
  );
}
