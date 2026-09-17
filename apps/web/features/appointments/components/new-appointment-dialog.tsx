'use client';

import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { SearchSelect, type SearchSelectItem } from '@/shared/components/forms/search-select';
import { useDebouncedCallback } from '@/shared/hooks/use-debounced-callback';
import { usePatientList } from '@/features/patients';
import {
  createAppointmentSchema,
  type CreateAppointmentInput,
  type CreateAppointmentOutput,
} from '../schemas/appointment';
import { useCreateAppointment } from '../hooks/use-appointments';
import { useProviders } from '../hooks/use-providers';

export function NewAppointmentDialog({
  defaultDate,
  defaultProviderId,
}: {
  defaultDate: string;
  defaultProviderId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New appointment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule appointment</DialogTitle>
          <DialogDescription>
            Search by patient name / MRN and pick the provider.
          </DialogDescription>
        </DialogHeader>
        <NewAppointmentForm
          defaultDate={defaultDate}
          defaultProviderId={defaultProviderId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function defaultStartIso(date: string): string {
  return `${date}T09:00`;
}

function defaultEndIso(date: string): string {
  return `${date}T09:30`;
}

function NewAppointmentForm({
  defaultDate,
  defaultProviderId,
  onDone,
}: {
  defaultDate: string;
  defaultProviderId?: string;
  onDone: () => void;
}) {
  const create = useCreateAppointment();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateAppointmentInput, unknown, CreateAppointmentOutput>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      type: 'CONSULT',
      patientId: '',
      providerId: defaultProviderId ?? '',
      startsAt: defaultStartIso(defaultDate),
      endsAt: defaultEndIso(defaultDate),
    },
  });

  // ── Patient picker — server-side search via usePatientList(q) ──
  // We hold a separate "search query" string and debounce updating it to
  // avoid hammering /api/patients on every keystroke. Initial fetch with
  // empty q returns the first page of recent patients so the dropdown is
  // useful before the user types anything.
  const [patientQuery, setPatientQuery] = useState('');
  const patients = usePatientList(patientQuery);
  const [setPatientQueryDebounced] = useDebouncedCallback(
    (q: string) => setPatientQuery(q),
    200,
  );
  const patientItems: SearchSelectItem[] = useMemo(() => {
    const rows = patients.data?.items ?? [];
    return rows.map((p) => ({
      id: p.id,
      label: `${p.firstName} ${p.lastName}`,
      sublabel: p.mrn,
    }));
  }, [patients.data]);

  // ── Provider picker — eligible delegatees + current user (one fetch). ──
  const providers = useProviders();
  const providerItems: SearchSelectItem[] = useMemo(() => {
    return (providers.data ?? []).map((p) => ({
      id: p.id,
      label: p.name,
      sublabel: `${p.role}${p.email ? ` · ${p.email}` : ''}`,
    }));
  }, [providers.data]);

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset();
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Patient" error={errors.patientId?.message}>
          <Controller
            control={control}
            name="patientId"
            render={({ field }) => (
              <SearchSelect
                value={field.value ?? ''}
                onChange={field.onChange}
                items={patientItems}
                isLoading={patients.isFetching}
                onQueryChange={setPatientQueryDebounced}
                placeholder="Search by name or MRN…"
                emptyMessage={patientQuery ? 'No matching patients' : 'Start typing to search'}
              />
            )}
          />
        </FormField>
        <FormField label="Provider" error={errors.providerId?.message}>
          <Controller
            control={control}
            name="providerId"
            render={({ field }) => (
              <SearchSelect
                value={field.value ?? ''}
                onChange={field.onChange}
                items={providerItems}
                isLoading={providers.isFetching}
                placeholder="Pick a provider…"
                emptyMessage="No active providers"
              />
            )}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Starts" error={errors.startsAt?.message}>
          <Input type="datetime-local" {...register('startsAt')} />
        </FormField>
        <FormField label="Ends" error={errors.endsAt?.message}>
          <Input type="datetime-local" {...register('endsAt')} />
        </FormField>
      </div>
      <FormField label="Type" error={errors.type?.message}>
        <Select {...register('type')}>
          <option value="CONSULT">Consult</option>
          <option value="FOLLOWUP">Follow-up</option>
          <option value="PROCEDURE">Procedure</option>
          <option value="TELEMED">Telemedicine</option>
        </Select>
      </FormField>
      <FormField label="Reason" error={errors.reason?.message}>
        <Input placeholder="e.g. sore throat 3 days" {...register('reason')} />
      </FormField>
      {create.error && (
        <p className="text-xs text-destructive">{(create.error as Error).message}</p>
      )}
      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || create.isPending}>
          {create.isPending ? 'Scheduling…' : 'Schedule'}
        </Button>
      </DialogFooter>
    </form>
  );
}
