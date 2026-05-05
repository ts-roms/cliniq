'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import {
  createAppointmentSchema,
  type CreateAppointmentInput,
  type CreateAppointmentOutput,
} from '../schemas/appointment';
import { useCreateAppointment } from '../hooks/use-appointments';

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
            Pick patient and provider IDs from your existing records.
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
    formState: { errors, isSubmitting },
  } = useForm<CreateAppointmentInput, unknown, CreateAppointmentOutput>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      type: 'CONSULT',
      providerId: defaultProviderId ?? '',
      startsAt: defaultStartIso(defaultDate),
      endsAt: defaultEndIso(defaultDate),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset();
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Patient ID" error={errors.patientId?.message}>
          <Input placeholder="cl..." {...register('patientId')} />
        </FormField>
        <FormField label="Provider ID" error={errors.providerId?.message}>
          <Input placeholder="cl..." {...register('providerId')} />
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
