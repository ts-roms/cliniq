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
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  rescheduleSchema,
  type Appointment,
  type RescheduleInput,
} from '../schemas/appointment';
import { useRescheduleAppointment } from '../hooks/use-appointments';

/** ISO → the `YYYY-MM-DDTHH:mm` a datetime-local input wants, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RescheduleDialog({ appt }: { appt: Appointment }) {
  const [open, setOpen] = useState(false);
  const reschedule = useRescheduleAppointment();
  const {
    register,
    handleSubmit,
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
          <FormField label="Starts" error={errors.startsAt?.message}>
            <Input type="datetime-local" {...register('startsAt')} />
          </FormField>
          <FormField label="Ends" error={errors.endsAt?.message}>
            <Input type="datetime-local" {...register('endsAt')} />
          </FormField>
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
