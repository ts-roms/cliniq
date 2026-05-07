'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, FileText, Upload } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@org/ui';
import {
  CaseStatusPill,
  ChatPanel,
  MaterialsUsagePanel,
  NotesPanel,
  PhaseStrip,
  ShipmentWidget,
  TreatmentPlansPanel,
  labApi,
  useLabCase,
  useRenderConformityPdf,
  useTransitionLabCase,
  type LabCaseStatus,
} from '@/features/lab';

export default function LabCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { data: lc, isLoading, error, refetch } = useLabCase(id);
  const transition = useTransitionLabCase(id ?? '');

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!lc) return <p className="text-sm text-muted-foreground">Case not found.</p>;

  // Available transitions from the lab side.
  const fromLab: Partial<Record<LabCaseStatus, LabCaseStatus[]>> = {
    SUBMITTED: ['IN_PROGRESS', 'REJECTED'],
    IN_PROGRESS: ['AWAITING_PICKUP', 'SHIPPED', 'CANCELLED'],
    AWAITING_PICKUP: ['SHIPPED', 'DELIVERED'],
    SHIPPED: ['DELIVERED'],
  };
  const transitions = fromLab[lc.status] ?? [];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const presign = await labApi.presignLabCaseFile(id, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      await labApi.putToS3(presign, file);
      await labApi.confirmLabCaseFile(id, presign.fileId);
      await refetch();
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/lab/cases"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Inbox
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">
              Case #{lc.refNumber ?? '—'}
            </h1>
            <CaseStatusPill status={lc.status} />
            {lc.urgency === 'URGENT' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                URGENT
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{lc.product?.name}</span>
            {' — '}
            from {lc.clinic?.name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {transitions.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={
                t === 'IN_PROGRESS'
                  ? 'default'
                  : t === 'REJECTED' || t === 'CANCELLED'
                    ? 'outline'
                    : 'default'
              }
              disabled={transition.isPending}
              onClick={() => transition.mutate({ status: t })}
            >
              {labelForTransition(t)}
            </Button>
          ))}
          <ConformityPdfButton caseId={lc.id} />
        </div>
      </div>

      {transition.error && (
        <p className="text-sm text-destructive">
          {(transition.error as Error).message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Manufacturing</CardTitle>
          </CardHeader>
          <CardContent>
            <PhaseStrip
              caseId={lc.id}
              productPhases={lc.product.phases ?? []}
              side="lab"
              caseStatus={lc.status}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipment</CardTitle>
          </CardHeader>
          <CardContent>
            <ShipmentWidget caseId={lc.id} side="lab" caseStatus={lc.status} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Patient" value={lc.patientLabel ?? '—'} />
            <Row label="Doctor" value={lc.doctorLabel ?? '—'} />
            <Row label="Delivery center" value={lc.deliveryCenter ?? '—'} />
            <Row
              label="Due"
              value={lc.dueAt ? new Date(lc.dueAt).toLocaleDateString() : '—'}
            />
            <Row
              label="Price"
              value={
                lc.unitPrice
                  ? `${lc.currency} ${(lc.unitPrice / 100).toLocaleString()}`
                  : 'TBD'
              }
            />
            {lc.formData && Object.keys(lc.formData).length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                  Form data
                </div>
                <pre className="overflow-auto rounded bg-muted/50 p-2 text-xs">
                  {JSON.stringify(lc.formData, null, 2)}
                </pre>
              </div>
            )}
            {lc.notes && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </div>
                <p className="whitespace-pre-wrap text-sm">{lc.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Files</span>
              <span className="text-xs font-normal text-muted-foreground">
                {lc.files.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {lc.files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="truncate">{f.filename}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {humanSize(f.sizeBytes)}
                  </span>
                </li>
              ))}
              {lc.files.length === 0 && (
                <li className="text-xs text-muted-foreground">No files yet.</li>
              )}
            </ul>

            {(['SUBMITTED', 'IN_PROGRESS', 'AWAITING_PICKUP', 'SHIPPED'] as LabCaseStatus[]).includes(
              lc.status,
            ) && (
              <label className="block">
                <input
                  type="file"
                  className="hidden"
                  onChange={onFile}
                  disabled={uploading}
                />
                <span className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground hover:border-border hover:bg-muted/30">
                  <Upload className="h-4 w-4" aria-hidden />
                  {uploading ? 'Uploading…' : 'Attach a file'}
                </span>
              </label>
            )}
            {uploadErr && (
              <p className="text-xs text-destructive">{uploadErr}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Internal notes</CardTitle>
          </CardHeader>
          <CardContent>
            <NotesPanel caseId={lc.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Materials used</CardTitle>
          </CardHeader>
          <CardContent>
            <MaterialsUsagePanel caseId={lc.id} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chat with clinic</CardTitle>
        </CardHeader>
        <CardContent>
          <ChatPanel caseId={lc.id} side="lab" />
        </CardContent>
      </Card>

      <TreatmentPlansPanel caseId={lc.id} side="lab" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}

function labelForTransition(t: LabCaseStatus): string {
  switch (t) {
    case 'IN_PROGRESS':
      return 'Accept & start';
    case 'REJECTED':
      return 'Reject';
    case 'AWAITING_PICKUP':
      return 'Mark ready for pickup';
    case 'SHIPPED':
      return 'Mark shipped';
    case 'DELIVERED':
      return 'Mark delivered';
    case 'CANCELLED':
      return 'Cancel';
    default:
      return t.replace('_', ' ');
  }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function ConformityPdfButton({ caseId }: { caseId: string }) {
  const render = useRenderConformityPdf(caseId);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        render.mutate(undefined, {
          onSuccess: (res) => window.open(res.url, '_blank', 'noopener'),
        })
      }
      disabled={render.isPending}
      title="Render the conformity declaration with the default template"
    >
      {render.isPending ? 'Rendering…' : 'Conformity PDF'}
    </Button>
  );
}
