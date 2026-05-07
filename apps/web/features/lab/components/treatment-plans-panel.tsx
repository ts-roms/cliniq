'use client';

import { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@org/ui';
import {
  useClinicTreatmentPlans,
  useCreateLabTreatmentPlan,
  useDecideTreatmentPlan,
  useLabTreatmentPlans,
  useProposeLabTreatmentPlan,
  useUpdateLabTreatmentPlan,
} from '../hooks/use-lab';
import * as labApi from '../lib/api';
import type {
  LabTreatmentPlan,
  LabTreatmentPlanDecision,
  LabTreatmentPlanStatus,
} from '../lib/api';

const STATUS_LABEL: Record<LabTreatmentPlanStatus, string> = {
  DRAFT: 'Draft',
  PROPOSED: 'Proposed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REVISION_REQUESTED: 'Revision requested',
};

const STATUS_COLOR: Record<LabTreatmentPlanStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  PROPOSED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  REVISION_REQUESTED: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

export function TreatmentPlansPanel({
  caseId,
  side,
}: {
  caseId: string;
  side: 'lab' | 'clinic';
}) {
  const labQ = useLabTreatmentPlans(side === 'lab' ? caseId : null);
  const clinicQ = useClinicTreatmentPlans(side === 'clinic' ? caseId : null);
  const data = (side === 'lab' ? labQ.data : clinicQ.data) ?? [];
  const isLoading = side === 'lab' ? labQ.isLoading : clinicQ.isLoading;
  const error = side === 'lab' ? labQ.error : clinicQ.error;

  const [showNew, setShowNew] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Treatment plans</span>
          {side === 'lab' && (
            <Button size="sm" onClick={() => setShowNew((v) => !v)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {showNew ? 'Cancel' : 'New plan'}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}
        {showNew && side === 'lab' && (
          <NewPlanForm caseId={caseId} onDone={() => setShowNew(false)} />
        )}
        {data.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">
            {side === 'lab'
              ? 'No plans yet. Compose a draft and propose it to the clinic.'
              : 'The lab has not proposed a treatment plan for this case.'}
          </p>
        )}
        {data.map((plan) => (
          <PlanRow key={plan.id} plan={plan} side={side} />
        ))}
      </CardContent>
    </Card>
  );
}

function NewPlanForm({
  caseId,
  onDone,
}: {
  caseId: string;
  onDone: () => void;
}) {
  const create = useCreateLabTreatmentPlan();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) return;
    create.mutate(
      { caseId, title: title.trim(), summary: summary.trim() },
      {
        onSuccess: () => {
          setTitle('');
          setSummary('');
          onDone();
        },
      },
    );
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-md border bg-muted/20 p-3"
    >
      <Input
        required
        placeholder="Title (e.g. Aligner plan rev 1)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        required
        rows={6}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Markdown summary the clinic will decide on…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
      />
      {create.error && (
        <p className="text-sm text-destructive">
          {(create.error as Error).message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create draft'}
        </Button>
      </div>
    </form>
  );
}

function PlanRow({
  plan,
  side,
}: {
  plan: LabTreatmentPlan;
  side: 'lab' | 'clinic';
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{plan.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[plan.status]}`}
            >
              {STATUS_LABEL[plan.status]}
            </span>
            {plan.revision !== null && (
              <span className="text-xs text-muted-foreground">
                rev {plan.revision}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {plan.proposedAt
              ? `Proposed ${new Date(plan.proposedAt).toLocaleString()}`
              : `Created ${new Date(plan.createdAt).toLocaleString()}`}
          </div>
        </div>
        {side === 'lab' && (plan.status === 'DRAFT' || plan.status === 'REVISION_REQUESTED') && (
          <ProposeButton id={plan.id} />
        )}
        {side === 'clinic' && plan.status === 'PROPOSED' && (
          <DecisionButtons id={plan.id} />
        )}
      </div>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/30 px-2 py-1 text-xs">
        {plan.summary}
      </pre>
      {side === 'lab' && (plan.status === 'DRAFT' || plan.status === 'REVISION_REQUESTED') && (
        <EditableSummary plan={plan} />
      )}
      <FilesList plan={plan} side={side} />
      {plan.approvals.length > 0 && (
        <div className="mt-2 space-y-1 text-xs">
          <div className="font-medium uppercase text-muted-foreground">Decisions</div>
          {plan.approvals.map((a) => (
            <div key={a.id}>
              <span className="font-medium">{a.decision.replace('_', ' ')}</span> ·{' '}
              {new Date(a.decidedAt).toLocaleString()}
              {a.notes && <span className="text-muted-foreground"> — {a.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposeButton({ id }: { id: string }) {
  const propose = useProposeLabTreatmentPlan(id);
  return (
    <Button size="sm" onClick={() => propose.mutate()} disabled={propose.isPending}>
      {propose.isPending ? 'Proposing…' : 'Propose to clinic'}
    </Button>
  );
}

function DecisionButtons({ id }: { id: string }) {
  const decide = useDecideTreatmentPlan(id);
  const [notes, setNotes] = useState('');
  function go(decision: LabTreatmentPlanDecision) {
    decide.mutate({ decision, notes: notes.trim() || undefined }, {
      onSuccess: () => setNotes(''),
    });
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="h-8 w-56 rounded-md border border-input bg-background px-2 text-xs"
      />
      <div className="flex gap-1">
        <Button size="sm" onClick={() => go('APPROVED')} disabled={decide.isPending}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => go('REVISION_REQUESTED')}
          disabled={decide.isPending}
        >
          Request revision
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => go('REJECTED')}
          disabled={decide.isPending}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

function EditableSummary({ plan }: { plan: LabTreatmentPlan }) {
  const update = useUpdateLabTreatmentPlan(plan.id);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(plan.title);
  const [summary, setSummary] = useState(plan.summary);
  if (!editing) {
    return (
      <div className="mt-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        rows={6}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() =>
            update.mutate(
              { title, summary },
              { onSuccess: () => setEditing(false) },
            )
          }
          disabled={update.isPending}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function FilesList({
  plan,
  side,
}: {
  plan: LabTreatmentPlan;
  side: 'lab' | 'clinic';
}) {
  const isEditable = side === 'lab' && (plan.status === 'DRAFT' || plan.status === 'REVISION_REQUESTED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const presign = await labApi.presignLabTreatmentPlanFile(plan.id, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        kind: inferKind(file),
      });
      await labApi.putToS3(presign, file);
      // No explicit confirm — files are visible as soon as the row is
      // created. Re-list from server.
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(fileId: string) {
    setBusy(true);
    setError(null);
    try {
      await labApi.deleteLabTreatmentPlanFile(plan.id, fileId);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        Files
      </div>
      {plan.files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No files attached.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {plan.files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {f.filename}{' '}
                <span className="text-muted-foreground">
                  ({f.kind} · {humanSize(f.sizeBytes)})
                </span>
              </span>
              {isEditable && (
                <button
                  type="button"
                  onClick={() => onDelete(f.id)}
                  className="text-muted-foreground/60 hover:text-destructive"
                  aria-label={`Delete ${f.filename}`}
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isEditable && (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-primary hover:underline">
          <Upload className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Uploading…' : 'Upload file'}
          <input
            type="file"
            className="hidden"
            onChange={onUpload}
            disabled={busy}
          />
        </label>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function inferKind(file: File): 'STL' | 'IMAGE' | 'REPORT' | 'OTHER' {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.stl')) return 'STL';
  if (file.type.startsWith('image/')) return 'IMAGE';
  if (lower.endsWith('.pdf')) return 'REPORT';
  return 'OTHER';
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
