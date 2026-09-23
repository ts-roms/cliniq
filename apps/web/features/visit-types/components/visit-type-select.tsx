'use client';

import { useEffect } from 'react';
import { Select } from '@org/ui';
import { useVisitTypes } from '../hooks/use-visit-types';

/**
 * "What is this visit for?" — the clinic's own catalogue of checkups.
 *
 * Deliberately not the same control as appointment type: that one is the
 * modality (consult / follow-up / procedure / telemed) and answers a
 * different question. This one drives which clinical forms the consult
 * screen opens.
 *
 * Renders nothing when the clinic has not defined any visit types, so a
 * tenant that never visits the settings screen sees no new field.
 */
export function VisitTypeSelect({
  value,
  onChange,
  autoSelectDefault = true,
  id = 'visitTypeId',
  label = 'Visit type',
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  autoSelectDefault?: boolean;
  id?: string;
  label?: string;
}) {
  const { data, isLoading } = useVisitTypes();

  // Pre-select the clinic's default once, and only while the field is empty —
  // re-applying it would fight the user every time they clear the field.
  useEffect(() => {
    if (!autoSelectDefault || value || !data) return;
    const preset = data.find((v) => v.isDefault);
    if (preset) onChange(preset.id);
  }, [autoSelectDefault, value, data, onChange]);

  if (isLoading || !data || data.length === 0) return null;

  const selected = data.find((v) => v.id === value);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        data-test="visit-type-select"
      >
        <option value="">General visit</option>
        {data.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Select>
      {selected?.description && (
        <p className="text-xs text-muted-foreground">{selected.description}</p>
      )}
    </div>
  );
}
