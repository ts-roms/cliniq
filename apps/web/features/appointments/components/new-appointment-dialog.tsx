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
import { useFreeSlots, useProviders } from '@/features/availability';
import {
  createAppointmentSchema,
  type CreateAppointmentInput,
  type CreateAppointmentOutput,
} from '../schemas/appointment';
import {
  AvailabilityError,
  useCreateAppointment,
} from '../hooks/use-appointments';

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
            Pick a provider and a free slot; the list honours their hours and
            time off.
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

/** ISO instant → the `YYYY-MM-DDTHH:mm` a datetime-local input wants (browser local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const providers = useProviders();
  const [override, setOverride] = useState<AvailabilityError | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
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

  const providerId = watch('providerId');
  const startsAt = watch('startsAt');
  const slotDate = startsAt ? startsAt.slice(0, 10) : defaultDate;
  const slots = useFreeSlots(providerId || null, slotDate || null);

  const submit = async (values: CreateAppointmentOutput, force = false) => {
    try {
      await create.mutateAsync({
        ...values,
        ...(force ? { force: true } : {}),
      });
      reset();
      setOverride(null);
      onDone();
    } catch (err) {
      if (err instanceof AvailabilityError && err.overridable) {
        setOverride(err);
        return;
      }
      throw err;
    }
  };

  const onSubmit = handleSubmit((values) => submit(values));

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Patient ID" error={errors.patientId?.message}>
          <Input placeholder="cl..." {...register('patientId')} />
        </FormField>
        <FormField label="Provider" error={errors.providerId?.message}>
          <Select {...register('providerId')}>
            <option value="">Select…</option>
            {(providers.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.specialty ? ` · ${p.specialty}` : ''}
              </option>
            ))}
          </Select>
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

      {providerId && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Free on {slotDate}
            {slots.data?.unrestricted && ' (no hours set — any time works)'}
          </p>
          {slots.isLoading && (
            <p className="text-xs text-muted-foreground">Loading slots…</p>
          )}
          {slots.data &&
            slots.data.slots.length === 0 &&
            !slots.data.unrestricted && (
              <p className="text-xs text-muted-foreground">
                No free slots that day.
              </p>
            )}
          {slots.data && slots.data.slots.length > 0 && (
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {slots.data.slots.map((s) => {
                const active = toLocalInput(s.startsAt) === startsAt;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    className={`rounded border px-2 py-0.5 text-xs ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => {
                      setValue('startsAt', toLocalInput(s.startsAt), {
                        shouldValidate: true,
                      });
                      setValue('endsAt', toLocalInput(s.endsAt), {
                        shouldValidate: true,
                      });
                      setOverride(null);
                    }}
                  >
                    {new Date(s.startsAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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

      {override && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{override.message}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={create.isPending}
            onClick={handleSubmit((values) => submit(values, true))}
          >
            Book anyway (override)
          </Button>
        </div>
      )}
      {create.error && !override && (
        <p className="text-xs text-destructive">
          {(create.error as Error).message}
        </p>
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
