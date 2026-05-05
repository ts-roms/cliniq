'use client';

import { useCallback, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { useDebouncedCallback } from '@/shared/hooks/use-debounced-callback';
import { useElapsedSeconds } from '@/shared/hooks/use-elapsed';
import type { SoapNote } from '../schemas/consultation';

interface Props {
  initial: SoapNote;
  locked: boolean;
  onSave: (note: SoapNote) => void;
  isSaving: boolean;
  /** ISO timestamp of last successful save; null until first save. */
  lastSavedAt: string | null;
  /** Autosave debounce window in ms. Default 2500. */
  autosaveDelayMs?: number;
}

const SECTIONS: Array<{ key: keyof SoapNote; label: string; placeholder: string }> = [
  { key: 'subjective', label: 'Subjective', placeholder: 'Chief complaint, HPI, ROS…' },
  { key: 'objective', label: 'Objective', placeholder: 'Vitals, physical exam findings…' },
  { key: 'assessment', label: 'Assessment', placeholder: 'Differential, diagnoses with reasoning…' },
  { key: 'plan', label: 'Plan', placeholder: 'Diagnostics, meds, follow-up, education…' },
];

export function SoapEditor({
  initial,
  locked,
  onSave,
  isSaving,
  lastSavedAt,
  autosaveDelayMs = 2500,
}: Props) {
  const [draft, setDraft] = useState<Record<keyof SoapNote, string>>({
    subjective: extractText(initial.subjective),
    objective: extractText(initial.objective),
    assessment: extractText(initial.assessment),
    plan: extractText(initial.plan),
  });
  const [isDirty, setIsDirty] = useState(false);

  const persist = useCallback(
    (current: Record<keyof SoapNote, string>) => {
      onSave({
        subjective: { text: current.subjective },
        objective: { text: current.objective },
        assessment: { text: current.assessment },
        plan: { text: current.plan },
      });
      setIsDirty(false);
    },
    [onSave],
  );

  const [scheduleAutosave, flush] = useDebouncedCallback(persist, autosaveDelayMs);

  const update = (key: keyof SoapNote, value: string) => {
    if (locked) return;
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      setIsDirty(true);
      scheduleAutosave(next);
      return next;
    });
  };

  const saveNow = () => {
    flush();
    persist(draft);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">SOAP note</CardTitle>
          <SaveStatus
            isSaving={isSaving}
            isDirty={isDirty}
            lastSavedAt={lastSavedAt}
            locked={locked}
          />
        </div>
        <Button size="sm" onClick={saveNow} disabled={locked || isSaving || !isDirty}>
          {isSaving ? 'Saving…' : locked ? 'Locked' : 'Save'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {SECTIONS.map((s) => (
          <SoapSection
            key={s.key}
            label={s.label}
            placeholder={s.placeholder}
            value={draft[s.key]}
            disabled={locked}
            onChange={(v) => update(s.key, v)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SaveStatus({
  isSaving,
  isDirty,
  lastSavedAt,
  locked,
}: {
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: string | null;
  locked: boolean;
}) {
  const elapsed = useElapsedSeconds(lastSavedAt);

  if (locked) return <span className="text-xs text-muted-foreground">Locked</span>;
  if (isSaving) return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (isDirty) return <span className="text-xs text-muted-foreground">Unsaved changes</span>;
  if (lastSavedAt) {
    return (
      <span className="text-xs text-muted-foreground">
        Saved {formatRelative(elapsed)} ago
      </span>
    );
  }
  return null;
}

function formatRelative(sec: number): string {
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function SoapSection({
  label,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <textarea
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

// SOAP blocks are stored as JSON for future rich-text. For the MVP editor we
// flatten to a single text field per section.
function extractText(value: SoapNote[keyof SoapNote] | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const v = value as Record<string, unknown>;
  if (typeof v.text === 'string') return v.text;
  return JSON.stringify(value, null, 2);
}
