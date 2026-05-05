'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
} from '@org/ui';
import { Odontogram } from './odontogram';
import {
  ADULT_QUADRANTS,
  DECIDUOUS_QUADRANTS,
  FINDING_FILL,
  FINDING_LABEL,
  STATUS_FILL,
  STATUS_LABEL,
  SURFACE_LABEL,
  surfaceFindingEnum,
  toothStatusEnum,
  toothSurfaceEnum,
  type DentalChartRecord,
  type Dentition,
  type SurfaceFinding,
  type ToothEntryRecord,
  type ToothStatus,
  type ToothSurface,
} from '../schemas/dental';
import {
  useLatestDentalChart,
  useUpsertDentalChart,
} from '../hooks/use-dental';

type DraftSurface = { surface: ToothSurface; finding: SurfaceFinding; notes?: string | null };
type DraftTooth = {
  toothCode: string;
  status: ToothStatus;
  notes?: string | null;
  surfaces: DraftSurface[];
};

function fdiCodes(dentition: Dentition): string[] {
  const q = dentition === 'DECIDUOUS' ? DECIDUOUS_QUADRANTS : ADULT_QUADRANTS;
  return [...q.upperRight, ...q.upperLeft, ...q.lowerLeft, ...q.lowerRight];
}

function chartToDraft(chart: DentalChartRecord | null, dentition: Dentition): DraftTooth[] {
  const codes = fdiCodes(dentition);
  const byCode = new Map<string, ToothEntryRecord>();
  for (const t of chart?.teeth ?? []) byCode.set(t.toothCode, t);
  return codes.map((code) => {
    const existing = byCode.get(code);
    return {
      toothCode: code,
      status: existing?.status ?? 'PRESENT',
      notes: existing?.notes ?? null,
      surfaces:
        existing?.surfaces.map((s) => ({
          surface: s.surface,
          finding: s.finding,
          notes: s.notes ?? null,
        })) ?? [],
    };
  });
}

export function DentalChartCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useLatestDentalChart(patientId);
  const upsert = useUpsertDentalChart(patientId);

  const [editing, setEditing] = useState(false);
  const [dentition, setDentition] = useState<Dentition>('ADULT');
  const [draft, setDraft] = useState<DraftTooth[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [notes, setNotes] = useState('');

  // Initialize draft + dentition when entering edit mode or when data first arrives.
  useEffect(() => {
    if (data) {
      setDentition(data.dentition);
      setDraft(chartToDraft(data, data.dentition));
      setNotes(data.notes ?? '');
    } else if (!editing) {
      setDraft(chartToDraft(null, dentition));
    }
  }, [data, dentition, editing]);

  const teethForView: ToothEntryRecord[] = useMemo(() => {
    if (editing) {
      return draft.map((t) => ({
        id: t.toothCode,
        toothCode: t.toothCode,
        status: t.status,
        notes: t.notes,
        surfaces: t.surfaces.map((s) => ({
          id: `${t.toothCode}-${s.surface}`,
          surface: s.surface,
          finding: s.finding,
          notes: s.notes,
        })),
      }));
    }
    return data?.teeth ?? [];
  }, [editing, draft, data]);

  const selectedTooth = editing
    ? draft.find((t) => t.toothCode === selected)
    : data?.teeth.find((t) => t.toothCode === selected);

  function startEdit() {
    setDraft(chartToDraft(data ?? null, dentition));
    setNotes(data?.notes ?? '');
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSelected(undefined);
  }

  function changeDentition(next: Dentition) {
    setDentition(next);
    setDraft(chartToDraft(data ?? null, next));
    setSelected(undefined);
  }

  function updateTooth(code: string, patch: Partial<DraftTooth>) {
    setDraft((prev) =>
      prev.map((t) => (t.toothCode === code ? { ...t, ...patch } : t)),
    );
  }

  function addSurfaceFinding(code: string, surface: ToothSurface, finding: SurfaceFinding) {
    setDraft((prev) =>
      prev.map((t) => {
        if (t.toothCode !== code) return t;
        const others = t.surfaces.filter((s) => s.surface !== surface);
        return { ...t, surfaces: [...others, { surface, finding }] };
      }),
    );
  }

  function removeSurfaceFinding(code: string, surface: ToothSurface) {
    setDraft((prev) =>
      prev.map((t) =>
        t.toothCode === code
          ? { ...t, surfaces: t.surfaces.filter((s) => s.surface !== surface) }
          : t,
      ),
    );
  }

  async function save() {
    // Only send teeth that diverge from defaults (status PRESENT + no surfaces + no notes).
    const teeth = draft.filter(
      (t) => t.status !== 'PRESENT' || t.surfaces.length > 0 || (t.notes && t.notes.trim()),
    );
    await upsert.mutateAsync({
      dentition,
      notes: notes.trim() || undefined,
      teeth: teeth.map((t) => ({
        toothCode: t.toothCode,
        status: t.status,
        notes: t.notes ?? undefined,
        surfaces:
          t.surfaces.length > 0
            ? t.surfaces.map((s) => ({
                surface: s.surface,
                finding: s.finding,
                notes: s.notes ?? undefined,
              }))
            : undefined,
      })),
    });
    setEditing(false);
    setSelected(undefined);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Odontogram</CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={dentition}
            onChange={(e) => changeDentition(e.target.value as Dentition)}
            disabled={!editing}
            className="h-8 text-sm"
          >
            <option value="ADULT">Adult (FDI 11–48)</option>
            <option value="DECIDUOUS">Deciduous (51–85)</option>
            <option value="MIXED">Mixed</option>
          </Select>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={startEdit}>
              Edit
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={upsert.isPending}>
                {upsert.isPending ? 'Saving…' : 'Save chart'}
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        )}

        <div className="overflow-x-auto rounded border bg-card p-3">
          <Odontogram
            dentition={dentition}
            teeth={teethForView}
            selectedTooth={selected}
            onSelectTooth={editing ? setSelected : setSelected}
          />
        </div>

        {selected && selectedTooth && (
          <div className="rounded border bg-muted/30 p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium">Tooth {selected}</div>
              {editing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(undefined)}
                >
                  Close
                </Button>
              )}
            </div>

            {/* Status */}
            <div className="mb-3 flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Status</label>
              {editing ? (
                <Select
                  value={selectedTooth.status}
                  onChange={(e) =>
                    updateTooth(selected, { status: e.target.value as ToothStatus })
                  }
                  className="h-7 text-xs"
                >
                  {toothStatusEnum.options.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-xs">{STATUS_LABEL[selectedTooth.status]}</span>
              )}
            </div>

            {/* Surface findings */}
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Surface findings
              </div>
              <ul className="space-y-1">
                {selectedTooth.surfaces.length === 0 && (
                  <li className="text-xs text-muted-foreground">— none —</li>
                )}
                {selectedTooth.surfaces.map((s) => (
                  <li
                    key={s.surface}
                    className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1"
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border"
                        style={{ backgroundColor: FINDING_FILL[s.finding] }}
                      />
                      <span className="font-mono">{s.surface}</span>
                      <span>{SURFACE_LABEL[s.surface]}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{FINDING_LABEL[s.finding]}</span>
                    </span>
                    {editing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeSurfaceFinding(selected, s.surface)}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {editing && (
                <AddFindingForm
                  onAdd={(surface, finding) =>
                    addSurfaceFinding(selected, surface, finding)
                  }
                />
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <div className="mb-1 font-medium">Tooth status</div>
            <ul className="grid grid-cols-2 gap-1">
              {toothStatusEnum.options.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm border"
                    style={{ backgroundColor: STATUS_FILL[s] }}
                  />
                  {STATUS_LABEL[s]}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 font-medium">Surface findings</div>
            <ul className="grid grid-cols-2 gap-1">
              {surfaceFindingEnum.options.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm border"
                    style={{ backgroundColor: FINDING_FILL[f] }}
                  />
                  {FINDING_LABEL[f]}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Chart-level notes */}
        {editing && (
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Chart notes
            </label>
            <textarea
              className="mt-1 w-full rounded border bg-card p-2 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Overall observations…"
            />
          </div>
        )}
        {!editing && data?.notes && (
          <p className="text-xs italic text-muted-foreground">{data.notes}</p>
        )}

        {!editing && !data && !isLoading && (
          <p className="text-sm text-muted-foreground">
            No dental chart yet. Click Edit to create one.
          </p>
        )}
        {upsert.error && (
          <p className="text-xs text-destructive">
            {(upsert.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AddFindingForm({
  onAdd,
}: {
  onAdd: (surface: ToothSurface, finding: SurfaceFinding) => void;
}) {
  const [surface, setSurface] = useState<ToothSurface>('O');
  const [finding, setFinding] = useState<SurfaceFinding>('CARIES');
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Select
        value={surface}
        onChange={(e) => setSurface(e.target.value as ToothSurface)}
        className="h-7 text-xs"
      >
        {toothSurfaceEnum.options.map((s) => (
          <option key={s} value={s}>
            {s} — {SURFACE_LABEL[s]}
          </option>
        ))}
      </Select>
      <Select
        value={finding}
        onChange={(e) => setFinding(e.target.value as SurfaceFinding)}
        className="h-7 text-xs"
      >
        {surfaceFindingEnum.options.map((f) => (
          <option key={f} value={f}>
            {FINDING_LABEL[f]}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="outline" onClick={() => onAdd(surface, finding)}>
        Add finding
      </Button>
    </div>
  );
}
