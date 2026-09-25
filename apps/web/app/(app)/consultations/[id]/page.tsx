'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  CompleteConsultDialog,
  SoapDraftPanel,
  SoapEditor,
  soapSectionText,
  useConsultation,
  useDecideSuggestion,
  useGenerateSoapDraft,
  useSuggestions,
  useUpdateSoap,
} from '@/features/consultations';
import { DermatologyPanel } from '@/features/dermatology';
import { ConsultLabsPanel } from '@/features/labs';
import { StartTelePanel } from '@/features/tele';
import { VisitFocusPanel } from '@/features/visit-types';
import { useElapsedSeconds, formatDuration } from '@/shared/hooks/use-elapsed';
import { useCan } from '@/features/auth';
import { Actions } from '@org/shared-types';

export default function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const can = useCan();
  const canWrite = can(Actions.CONSULT_WRITE);

  const consult = useConsultation(id);
  const suggestions = useSuggestions(id);
  const generate = useGenerateSoapDraft(id);
  const decide = useDecideSuggestion(id);

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
  const completed = c.status === 'COMPLETED' || !!c.lockedAt;
  // A role that can open or read a consult but not write it (ADMIN starts
  // one for a clinician) sees it view-only rather than an editor the api
  // would 403 on every save.
  const locked = completed || !canWrite;

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <ConsultHeader
        consultationId={id}
        startedAt={c.startedAt}
        endedAt={c.endedAt ?? null}
        status={c.status}
        patientId={c.patientId}
        providerName={c.provider?.name ?? null}
        locked={locked}
        soap={{
          subjective: soapSectionText(c.subjective),
          objective: soapSectionText(c.objective),
          assessment: soapSectionText(c.assessment),
          plan: soapSectionText(c.plan),
        }}
      />

      {!canWrite && !completed && (
        <p
          className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          data-test="consult-view-only"
        >
          View only —{' '}
          {c.provider?.name ? (
            <span className="font-medium text-foreground">
              {c.provider.name}
            </span>
          ) : (
            'the attending clinician'
          )}{' '}
          writes and completes this consultation.
        </p>
      )}

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
            lockedLabel={completed ? 'Locked' : 'View only'}
            isSaving={updateSoap.isPending}
            lastSavedAt={lastSavedAt}
            onSave={async (note) => {
              await updateSoap.mutateAsync(note);
              setLastSavedAt(new Date().toISOString());
            }}
          />
        </div>
        <div className="space-y-6">
          <VisitFocusPanel
            visitTypeId={(c as { visitTypeId?: string | null }).visitTypeId}
            patientId={c.patientId}
          />
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
  consultationId,
  startedAt,
  endedAt,
  status,
  patientId,
  providerName,
  locked,
  soap,
}: {
  consultationId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  patientId: string;
  providerName: string | null;
  locked: boolean;
  soap: {
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  };
}) {
  // Live tick while in progress; freeze the duration once ended.
  const liveSec = useElapsedSeconds(endedAt ? null : startedAt);
  const totalSec = endedAt
    ? Math.max(
        0,
        Math.floor(
          (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
        ),
      )
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
          <h1 className="text-xl font-extralight tracking-tight sm:text-2xl">
            Consultation
          </h1>
          <p className="text-sm text-muted-foreground">
            {status}
            {providerName && (
              <>
                {' · with '}
                <span data-test="consult-provider">{providerName}</span>
              </>
            )}{' '}
            · started {new Date(startedAt).toLocaleString()} ·{' '}
            <span className="tabular-nums">{formatDuration(totalSec)}</span>
            {endedAt ? '' : ' (running)'}
          </p>
        </div>
        {!locked && (
          <CompleteConsultDialog consultationId={consultationId} soap={soap} />
        )}
      </div>
    </header>
  );
}
