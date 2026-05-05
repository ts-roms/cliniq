'use client';

import { useState } from 'react';
import {
  NewAppointmentDialog,
  ScheduleDayPicker,
  ScheduleEmpty,
  ScheduleTable,
  useAppointmentRange,
} from '@/features/appointments';
import { SubscribeFeedButton } from '@/features/calendars';
import { useSession } from '@/features/auth';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayBoundsIso(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatDateLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const FEED_ROLES = new Set(['OWNER', 'ADMIN', 'DOCTOR', 'NURSE']);

export default function SchedulePage() {
  const session = useSession();
  const [date, setDate] = useState(todayIso());
  const { from, to } = dayBoundsIso(date);
  const { data, isLoading, error } = useAppointmentRange(from, to);
  const canSubscribe = session && FEED_ROLES.has(session.user.role);

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateLabel(date)} ·{' '}
            {data ? `${data.length} appointment${data.length === 1 ? '' : 's'}` : '…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSubscribe && <SubscribeFeedButton />}
          <NewAppointmentDialog defaultDate={date} />
        </div>
      </header>

      <div className="mb-4">
        <ScheduleDayPicker value={date} onChange={setDate} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      )}
      {data && data.length === 0 && <ScheduleEmpty dateLabel={formatDateLabel(date)} />}
      {data && data.length > 0 && <ScheduleTable items={data} />}
    </div>
  );
}
