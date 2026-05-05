'use client';

import { memo } from 'react';
import { Button } from '@org/ui';
import type { Appointment, AppointmentStatus } from '../schemas/appointment';
import {
  useCancelAppointment,
  useCheckInAppointment,
} from '../hooks/use-appointments';

const STATUS_TONE: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  CHECKED_IN: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-zinc-200 text-zinc-700',
  NO_SHOW: 'bg-rose-100 text-rose-800',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const AppointmentRow = memo(function AppointmentRow({
  appt,
}: {
  appt: Appointment;
}) {
  const checkIn = useCheckInAppointment();
  const cancel = useCancelAppointment();

  const canCheckIn = appt.status === 'SCHEDULED';
  const canCancel = appt.status === 'SCHEDULED' || appt.status === 'CHECKED_IN';

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 text-sm font-mono">
        {formatTime(appt.startsAt)} – {formatTime(appt.endsAt)}
      </td>
      <td className="px-4 py-3 text-sm">
        {appt.patient
          ? `${appt.patient.lastName}, ${appt.patient.firstName}`
          : appt.patientId}
        {appt.patient && (
          <span className="ml-1 text-xs text-muted-foreground">
            · {appt.patient.mrn}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{appt.type}</td>
      <td className="px-4 py-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[appt.status]}`}
        >
          {appt.status.replace('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {appt.reason ?? '—'}
      </td>
      <td className="px-4 py-3 text-right">
        {canCheckIn && (
          <Button
            size="sm"
            variant="outline"
            disabled={checkIn.isPending}
            onClick={() => checkIn.mutate(appt.id)}
          >
            {checkIn.isPending ? '…' : 'Check in'}
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-1 text-destructive hover:text-destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(appt.id)}
          >
            Cancel
          </Button>
        )}
      </td>
    </tr>
  );
});
