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
  PhaseStrip,
  ShipmentWidget,
  TreatmentPlansPanel,
  labApi,
  useClinicCase,
  useTransitionClinicCase,
  type LabCaseStatus,
} from '@/features/lab';

export default function ClinicLabCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { data: lc, isLoading, error, refetch } = useClinicCase(id);
  const transition = useTransitionClinicCase(id ?? '');

  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!lc) return <p className="text-sm text-muted-foreground">Case not found.</p>;

  // Available transitions from the clinic side.
  const fromClinic: Partial<Record<LabCaseStatus, LabCaseStatus[]>> = {
    DRAFT: ['SUBMITTED', 'CANCELLED'],
    SUBMITTED: ['CANCELLED'],
    SHIPPED: ['DELIVERED'],
    AWAITING_PICKUP: ['DELIVERED'],
  };
  const transitions = fromClinic[lc.status] ?? [];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const presign = await labApi.presignClinicCaseFile(id, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      await labApi.putToS3(presign, file);
      await labApi.confirmClinicCaseFile(id, presign.fileId);
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
        href="/lab-cases"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All cases
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">
              Case {lc.refNumber ? `#${lc.refNumber}` : '(draft)'}
            </h1>
            <CaseStatusPill status={lc.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{lc.product?.name}</span>
            {' — '}
            with {lc.lab?.name} ({lc.lab?.slug})
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {transitions.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={t === 'SUBMITTED' ? 'default' : 'outline'}
              disabled={transition.isPending}
              onClick={() => transition.mutate({ status: t })}
            >
              {t === 'SUBMITTED'
                ? 'Submit'
                : t === 'CANCELLED'
                  ? 'Cancel case'
                  : t === 'DELIVERED'
                    ? 'Mark delivered'
                    : t.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      {transition.error && (
        <p className="text-sm text-destructive">
          {(transition.error as Error).message}
        </p>
      )}

      {(lc.product.phases?.length ?? 0) > 0 && lc.status === 'IN_PROGRESS' && (
        <Card>
          <CardHeader>
            <CardTitle>Manufacturing progress</CardTitle>
          </CardHeader>
          <CardContent>
            <PhaseStrip
              caseId={lc.id}
              productPhases={lc.product.phases ?? []}
              side="clinic"
              caseStatus={lc.status}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Patient" value={lc.patientLabel ?? '—'} />
            <Row label="Doctor" value={lc.doctorLabel ?? '—'} />
            <Row label="Urgency" value={lc.urgency} />
            <Row
              label="Due"
              value={lc.dueAt ? new Date(lc.dueAt).toLocaleDateString() : '—'}
            />
            <Row
              label="Price"
              value={
                lc.unitPrice
                  ? `${lc.currency} ${(lc.unitPrice / 100).toLocaleString()}`
                  : 'TBD (lab will set)'
              }
            />
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

            {(['DRAFT', 'SUBMITTED', 'IN_PROGRESS'] as LabCaseStatus[]).includes(
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

      {(['SHIPPED', 'DELIVERED', 'AWAITING_PICKUP'] as LabCaseStatus[]).includes(lc.status) && (
        <Card>
          <CardHeader>
            <CardTitle>Shipment</CardTitle>
          </CardHeader>
          <CardContent>
            <ShipmentWidget caseId={lc.id} side="clinic" caseStatus={lc.status} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Chat with lab</CardTitle>
        </CardHeader>
        <CardContent>
          <ChatPanel caseId={lc.id} side="clinic" />
        </CardContent>
      </Card>

      <TreatmentPlansPanel caseId={lc.id} side="clinic" />
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

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
