'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { useProviders } from '@/features/availability';
import {
  useConsultationsForPatient,
  useStartConsultation,
} from '../hooks/use-consultations';

const ROLE_LABEL: Record<string, string> = {
  DOCTOR: 'Doctor',
  NURSE: 'Nurse',
  OWNER: 'Owner',
};

/**
 * "Start consultation" for a role that may open a consult but not write one
 * (ADMIN). The front office opens the encounter when the patient is roomed;
 * the clinician picked here is the provider of record and writes the note.
 * Who opened it is kept in the audit log.
 */
export function StartConsultForDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState('');
  const router = useRouter();
  const providers = useProviders();
  const consults = useConsultationsForPatient(patientId);
  const start = useStartConsultation(patientId);
  // Starting twice by accident is easy — the header gives no other hint that
  // one is already running — so name the open one and link to it.
  const inProgress = (consults.data ?? []).find(
    (c) => c.status === 'IN_PROGRESS',
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId) return;
    const consult = await start.mutateAsync({ providerId });
    setProviderId('');
    setOpen(false);
    // Land on the new consult: it confirms the start and names who it is with.
    router.push(`/consultations/${consult.id}`);
  };

  const list = providers.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) start.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button data-test="start-consult-for-button">Start consultation</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start consultation</DialogTitle>
          <DialogDescription>
            Choose who will see the patient. They are recorded as the attending
            provider and write the consultation notes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          {inProgress && (
            <p
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
              data-test="start-consult-in-progress"
            >
              A consultation is already in progress
              {inProgress.provider?.name
                ? ` with ${inProgress.provider.name}`
                : ''}{' '}
              (started {new Date(inProgress.startedAt).toLocaleTimeString()}
              ).{' '}
              <Link
                href={`/consultations/${inProgress.id}`}
                className="font-medium underline"
              >
                Open it
              </Link>{' '}
              instead of starting another?
            </p>
          )}
          <FormField label="Attending clinician">
            <Select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              disabled={providers.isLoading || list.length === 0}
              data-test="start-consult-provider"
              required
            >
              <option value="">
                {providers.isLoading
                  ? 'Loading clinicians…'
                  : list.length === 0
                    ? 'No doctors or nurses in this clinic'
                    : 'Select a doctor or nurse'}
              </option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email} · {ROLE_LABEL[p.role] ?? p.role}
                  {p.specialty ? ` · ${p.specialty}` : ''}
                </option>
              ))}
            </Select>
          </FormField>
          {providers.error && (
            <p className="text-xs text-destructive">
              {(providers.error as Error).message}
            </p>
          )}
          {start.error && (
            <p className="text-xs text-destructive">
              {(start.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!providerId || start.isPending}
              data-test="start-consult-submit"
            >
              {start.isPending ? 'Starting…' : 'Start consultation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
