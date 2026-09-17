'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@org/ui';
import { useSession } from '@/features/auth';
import type { Appointment, AppointmentStatus } from '../schemas/appointment';
import {
  useCancelAppointment,
  useCheckInAppointment,
  useCompleteAppointment,
  useNoShowAppointment,
  useStartAppointment,
} from '../hooks/use-appointments';
import { RescheduleDialog } from './reschedule-dialog';

const STATUS_TONE: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  CHECKED_IN: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-zinc-200 text-zinc-700',
  NO_SHOW: 'bg-rose-100 text-rose-800',
};

/** Roles that hold CONSULT_WRITE — mirrors libs/auth roles.ts. */
const CLINICAL_ROLES = new Set(['OWNER', 'DOCTOR', 'NURSE']);

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * One schedule row with the actions the state machine allows from its
 * current status (see apps/api/src/appointments/appointment-transitions.ts):
 *
 *   SCHEDULED    check in · start · no-show · reschedule · cancel
 *   CHECKED_IN   start · no-show · cancel
 *   IN_PROGRESS  open consult · complete · cancel
 *   NO_SHOW      reschedule
 *   COMPLETED / CANCELLED  —
 */
export const AppointmentRow = memo(function AppointmentRow({
  appt,
}: {
  appt: Appointment;
}) {
  const router = useRouter();
  const session = useSession();
  const clinical = CLINICAL_ROLES.has(session?.user.role ?? '');

  const checkIn = useCheckInAppointment();
  const start = useStartAppointment();
  const complete = useCompleteAppointment();
  const noShow = useNoShowAppointment();
  const cancel = useCancelAppointment();
  const busy =
    checkIn.isPending ||
    start.isPending ||
    complete.isPending ||
    noShow.isPending ||
    cancel.isPending;
  const error =
    checkIn.error ??
    start.error ??
    complete.error ??
    noShow.error ??
    cancel.error;

  const s = appt.status;
  const canCheckIn = s === 'SCHEDULED';
  const canStart = clinical && (s === 'SCHEDULED' || s === 'CHECKED_IN');
  const canComplete = clinical && s === 'IN_PROGRESS';
  const canNoShow = s === 'SCHEDULED' || s === 'CHECKED_IN';
  const canReschedule =
    s === 'SCHEDULED' || s === 'CHECKED_IN' || s === 'NO_SHOW';
  const canCancel =
    s === 'SCHEDULED' || s === 'CHECKED_IN' || s === 'IN_PROGRESS';

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
        {appt.consultation && (
          <Link
            href={`/consultations/${appt.consultation.id}`}
            className="ml-2 text-xs text-primary hover:underline"
          >
            consult
          </Link>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {appt.reason ?? '—'}
        {appt.cancelReason && (
          <span className="block text-xs italic">
            cancelled: {appt.cancelReason}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-wrap justify-end gap-1">
          {canCheckIn && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => checkIn.mutate(appt.id)}
            >
              Check in
            </Button>
          )}
          {canStart && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                start.mutate(appt.id, {
                  onSuccess: ({ consultationId }) => {
                    if (consultationId)
                      router.push(`/consultations/${consultationId}`);
                  },
                })
              }
            >
              Start consult
            </Button>
          )}
          {canComplete && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => complete.mutate(appt.id)}
            >
              Complete
            </Button>
          )}
          {canReschedule && <RescheduleDialog appt={appt} />}
          {canNoShow && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => noShow.mutate(appt.id)}
            >
              No-show
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => cancel.mutate(appt.id)}
            >
              Cancel
            </Button>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-destructive">
            {(error as Error).message}
          </p>
        )}
      </td>
    </tr>
  );
});
