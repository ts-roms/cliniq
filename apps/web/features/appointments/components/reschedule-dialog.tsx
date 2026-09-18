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
} from '@org/ui';
import {
  rescheduleSchema,
  type Appointment,
  type RescheduleInput,
} from '../schemas/appointment';
import { useRescheduleAppointment } from '../hooks/use-appointments';
import { AppointmentWhenFields } from './appointment-when-fields';

/** ISO → `YYYY-MM-DDTHH:mm` in local time (what the when-fields edit). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RescheduleDialog({ appt }: { appt: Appointment }) {
  const [open, setOpen] = useState(false);
  const reschedule = useRescheduleAppointment();
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RescheduleInput>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: {
      startsAt: toLocalInput(appt.startsAt),
      endsAt: toLocalInput(appt.endsAt),
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    await reschedule.mutateAsync({
      id: appt.id,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
    });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Reschedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            The patient gets an email / SMS with the new time. Slots that
            overlap another appointment for this provider are refused.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <AppointmentWhenFields
            value={{ startsAt: watch('startsAt'), endsAt: watch('endsAt') }}
            onChange={(next) => {
              setValue('startsAt', next.startsAt, { shouldValidate: true });
              setValue('endsAt', next.endsAt, { shouldValidate: true });
            }}
            errors={{
              startsAt: errors.startsAt?.message,
              endsAt: errors.endsAt?.message,
            }}
          />
          {reschedule.error && (
            <p className="text-sm text-destructive">
              {(reschedule.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={reschedule.isPending}>
              {reschedule.isPending ? 'Saving…' : 'Move appointment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
