'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Button } from '@org/ui';
import {
  SoapDraftPanel,
  SoapEditor,
  useCompleteConsultation,
  useConsultation,
  useDecideSuggestion,
  useGenerateSoapDraft,
  useSuggestions,
  useUpdateSoap,
} from '@/features/consultations';
import { DermatologyPanel } from '@/features/dermatology';
import { ConsultLabsPanel } from '@/features/labs';
import { StartTelePanel } from '@/features/tele';
import { useElapsedSeconds, formatDuration } from '@/shared/hooks/use-elapsed';

export default function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const consult = useConsultation(id);
  const suggestions = useSuggestions(id);
  const generate = useGenerateSoapDraft(id);
  const decide = useDecideSuggestion(id);
  const complete = useCompleteConsultation(id);

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const updateSoap = useUpdateSoap(id);

  if (consult.isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 text-sm text-muted-foreground">
        Loading consultation…
      </div>
    );
  }

  if (consult.error || !consult.data) {
    return (
      <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-destructive">
          {(consult.error as Error)?.message ?? 'Not found'}
        </p>
      </div>
    );
  }

  const c = consult.data;
  const locked = c.status === 'COMPLETED' || !!c.lockedAt;

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <ConsultHeader
        startedAt={c.startedAt}
        endedAt={c.endedAt ?? null}
        status={c.status}
        patientId={c.patientId}
        locked={locked}
        isCompleting={complete.isPending}
        onComplete={() => complete.mutate()}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SoapEditor
            initial={{
              subjective: c.subjective ?? null,
              objective: c.objective ?? null,
              assessment: c.assessment ?? null,
              plan: c.plan ?? null,
            }}
            locked={locked}
            isSaving={updateSoap.isPending}
            lastSavedAt={lastSavedAt}
            onSave={async (note) => {
              await updateSoap.mutateAsync(note);
              setLastSavedAt(new Date().toISOString());
            }}
          />
        </div>
        <div className="space-y-6">
          <SoapDraftPanel
            suggestions={suggestions.data}
            isLoading={suggestions.isLoading}
            isGenerating={generate.isPending}
            isDeciding={decide.isPending}
            disabled={locked}
            onGenerate={(transcript) => generate.mutate(transcript)}
            onDecide={(input) => decide.mutate(input)}
          />
          <ConsultLabsPanel patientId={c.patientId} consultationId={id} />
          {!locked && (
            <StartTelePanel patientId={c.patientId} consultationId={id} />
          )}
          {!locked && <DermatologyPanel consultationId={id} />}
        </div>
      </div>
    </div>
  );
}

function ConsultHeader({
  startedAt,
  endedAt,
  status,
  patientId,
  locked,
  isCompleting,
  onComplete,
}: {
  startedAt: string;
  endedAt: string | null;
  status: string;
  patientId: string;
  locked: boolean;
  isCompleting: boolean;
  onComplete: () => void;
}) {
  // Live tick while in progress; freeze the duration once ended.
  const liveSec = useElapsedSeconds(endedAt ? null : startedAt);
  const totalSec = endedAt
    ? Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : liveSec;

  return (
    <header>
      <Link
        href={`/patients/${patientId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to patient
      </Link>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extralight tracking-tight sm:text-2xl">Consultation</h1>
          <p className="text-sm text-muted-foreground">
            {status} · started {new Date(startedAt).toLocaleString()} ·{' '}
            <span className="tabular-nums">{formatDuration(totalSec)}</span>
            {endedAt ? '' : ' (running)'}
          </p>
        </div>
        {!locked && (
          <Button variant="outline" onClick={onComplete} disabled={isCompleting}>
            {isCompleting ? 'Completing…' : 'Mark complete'}
          </Button>
        )}
      </div>
    </header>
  );
}
