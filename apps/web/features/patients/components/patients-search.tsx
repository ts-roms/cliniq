'use client';

import { Button, Input } from '@org/ui';

interface Props {
  value: string;
  onChange: (next: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
}

export function PatientsSearch({ value, onChange, onRefresh, isFetching }: Props) {
  return (
    <div className="mb-4 flex gap-2">
      <Input
        placeholder="Search by name, phone, MRN…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-sm"
      />
      <Button variant="outline" onClick={onRefresh} disabled={isFetching}>
        {isFetching ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
  );
}
