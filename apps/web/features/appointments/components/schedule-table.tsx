'use client';

import { memo } from 'react';
import type { Appointment } from '../schemas/appointment';
import { AppointmentRow } from './appointment-row';

export const ScheduleTable = memo(function ScheduleTable({
  items,
}: {
  items: Appointment[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[680px]">
        <thead className="bg-muted/40">
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2">Time</th>
            <th className="px-4 py-2">Patient</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Reason</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((appt) => (
            <AppointmentRow key={appt.id} appt={appt} />
          ))}
        </tbody>
      </table>
    </div>
  );
});
