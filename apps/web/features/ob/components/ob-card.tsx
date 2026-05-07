'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@org/ui';
import {
  obControllerCreate,
  obControllerCreateVisit,
  obControllerList,
  obControllerUpdate,
} from '@org/api-client';

interface Pregnancy {
  id: string;
  status: string;
  lmp: string | null;
  edd: string | null;
  eddSource: string | null;
  gravida: number | null;
  para: number | null;
  bloodType: string | null;
  notes: string | null;
  createdAt: string;
  obVisits?: Array<{
    id: string;
    visitDate: string;
    gaWeeks: number | null;
    gaDays: number | null;
    fundalHeightCm: string | null;
    fetalHeartRate: number | null;
    notes: string | null;
  }>;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-rose-100 text-rose-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  MISCARRIED: 'bg-zinc-200 text-zinc-700',
  TERMINATED: 'bg-zinc-200 text-zinc-700',
  ECTOPIC: 'bg-amber-100 text-amber-800',
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

export function ObCard({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['ob', 'pregnancies', patientId],
    queryFn: async (): Promise<Pregnancy[]> => {
      const { data, error } = await obControllerList({ query: { patientId } });
      if (error || !data) throw new Error('Failed to load OB');
      return data as unknown as Pregnancy[];
    },
  });
  const [showNew, setShowNew] = useState(false);

  const active = list.data?.find((p) => p.status === 'ACTIVE');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>OB / Pregnancy</span>
          {!active && (
            <Button size="sm" onClick={() => setShowNew((v) => !v)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {showNew ? 'Cancel' : 'New pregnancy'}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {list.error && (
          <p className="text-sm text-destructive">{(list.error as Error).message}</p>
        )}
        {showNew && !active && (
          <NewPregnancyForm patientId={patientId} onDone={() => setShowNew(false)} />
        )}
        {active && <ActivePregnancy pregnancy={active} />}
        {list.data && list.data.length === 0 && !showNew && (
          <p className="text-sm text-muted-foreground">
            No pregnancies recorded yet.
          </p>
        )}
        {list.data && list.data.filter((p) => p.status !== 'ACTIVE').length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              History
            </div>
            <ul className="mt-1 space-y-1 text-sm">
              {list.data
                .filter((p) => p.status !== 'ACTIVE')
                .map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between border-b py-1 last:border-0"
                  >
                    <span>
                      <span
                        className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[p.status]}`}
                      >
                        {p.status}
                      </span>
                      EDD {fmtDate(p.edd)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      G{p.gravida ?? '?'}P{p.para ?? '?'}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );

  function ActivePregnancy({ pregnancy }: { pregnancy: Pregnancy }) {
    const [showVisit, setShowVisit] = useState(false);
    const update = useMutation({
      mutationFn: async (status: 'DELIVERED' | 'MISCARRIED' | 'TERMINATED' | 'ECTOPIC') => {
        const { data, error } = await obControllerUpdate({
          path: { id: pregnancy.id },
          body: { status } as never,
        });
        if (error) throw new Error('failed');
        return data;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['ob'] }),
    });

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <Stat label="LMP" value={fmtDate(pregnancy.lmp)} />
          <Stat label="EDD" value={fmtDate(pregnancy.edd)} />
          <Stat label="Gravida" value={pregnancy.gravida?.toString() ?? '—'} />
          <Stat label="Para" value={pregnancy.para?.toString() ?? '—'} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setShowVisit((v) => !v)}>
            <Calendar className="mr-1 h-4 w-4" aria-hidden />
            {showVisit ? 'Cancel' : 'New OB visit'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm('Mark this pregnancy DELIVERED?')) update.mutate('DELIVERED');
            }}
          >
            Mark delivered
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm('Mark MISCARRIED? This is permanent.')) update.mutate('MISCARRIED');
            }}
          >
            Miscarried
          </Button>
        </div>

        {showVisit && (
          <NewVisitForm
            pregnancyId={pregnancy.id}
            onDone={() => setShowVisit(false)}
          />
        )}

        {pregnancy.obVisits && pregnancy.obVisits.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Recent visits
            </div>
            <ul className="mt-1 space-y-1 text-sm">
              {pregnancy.obVisits.slice(0, 5).map((v) => (
                <li key={v.id} className="border-b py-1 last:border-0">
                  <div className="flex items-center justify-between">
                    <span>{new Date(v.visitDate).toLocaleDateString()}</span>
                    <span className="text-xs text-muted-foreground">
                      {v.gaWeeks ?? '?'}w{v.gaDays ?? 0}d
                      {v.fundalHeightCm ? ` · FH ${v.fundalHeightCm}cm` : ''}
                      {v.fetalHeartRate ? ` · FHR ${v.fetalHeartRate}` : ''}
                    </span>
                  </div>
                  {v.notes && (
                    <p className="text-xs text-muted-foreground">{v.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function NewPregnancyForm({
  patientId,
  onDone,
}: {
  patientId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [lmp, setLmp] = useState('');
  const [gravida, setGravida] = useState('');
  const [para, setPara] = useState('');
  const [bloodType, setBloodType] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await obControllerCreate({
        body: {
          patientId,
          lmp: lmp || undefined,
          gravida: gravida ? Number(gravida) : undefined,
          para: para ? Number(para) : undefined,
          bloodType: bloodType || undefined,
        } as never,
      });
      if (error) throw new Error('Failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ob'] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="space-y-3 rounded-md border bg-muted/20 p-3"
    >
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block text-muted-foreground">LMP (last menstrual period)</span>
          <input
            type="date"
            value={lmp}
            onChange={(e) => setLmp(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-muted-foreground">Blood type</span>
          <Input
            value={bloodType}
            onChange={(e) => setBloodType(e.target.value)}
            placeholder="O+, A-, …"
            className="h-9"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-muted-foreground">Gravida</span>
          <Input
            type="number"
            min={1}
            value={gravida}
            onChange={(e) => setGravida(e.target.value)}
            className="h-9"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-muted-foreground">Para</span>
          <Input
            type="number"
            min={0}
            value={para}
            onChange={(e) => setPara(e.target.value)}
            className="h-9"
          />
        </label>
      </div>
      {create.error && (
        <p className="text-xs text-destructive">{(create.error as Error).message}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          Start pregnancy record
        </Button>
      </div>
    </form>
  );
}

function NewVisitForm({
  pregnancyId,
  onDone,
}: {
  pregnancyId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [fundalHeight, setFundalHeight] = useState('');
  const [fhr, setFhr] = useState('');
  const [presentation, setPresentation] = useState('');
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await obControllerCreateVisit({
        body: {
          pregnancyId,
          fundalHeightCm: fundalHeight ? Number(fundalHeight) : undefined,
          fetalHeartRate: fhr ? Number(fhr) : undefined,
          presentation: presentation || undefined,
          notes: notes || undefined,
        } as never,
      });
      if (error) throw new Error('Failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ob'] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="space-y-2 rounded-md border bg-muted/20 p-3"
    >
      <div className="grid gap-2 md:grid-cols-3">
        <label className="block text-xs">
          <span className="mb-1 block text-muted-foreground">Fundal height (cm)</span>
          <Input
            type="number"
            step="0.1"
            value={fundalHeight}
            onChange={(e) => setFundalHeight(e.target.value)}
            className="h-9"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-muted-foreground">FHR (bpm)</span>
          <Input
            type="number"
            value={fhr}
            onChange={(e) => setFhr(e.target.value)}
            className="h-9"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-muted-foreground">Presentation</span>
          <Input
            value={presentation}
            onChange={(e) => setPresentation(e.target.value)}
            placeholder="cephalic, breech…"
            className="h-9"
          />
        </label>
      </div>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={create.isPending}>
          Save visit
        </Button>
      </div>
    </form>
  );
}
