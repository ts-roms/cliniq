'use client';

import { Button, Input } from '@org/ui';

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ScheduleDayPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange(shiftIso(value, -1))}
      >
        ‹ Prev
      </Button>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-40"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange(shiftIso(value, 1))}
      >
        Next ›
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChange(new Date().toISOString().slice(0, 10))}
      >
        Today
      </Button>
    </div>
  );
}
