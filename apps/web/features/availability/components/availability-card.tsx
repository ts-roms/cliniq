'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from '@org/ui';
import { useSession } from '@/features/auth';
import {
  useAddTimeOff,
  useProviderAvailability,
  useProviders,
  useRemoveTimeOff,
  useSetWeeklySchedule,
  type WeeklyRange,
} from '../hooks/use-availability';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Per-provider weekly hours + time off. Owners/admins pick any provider;
 * a doctor sees only themselves (the api refuses edits to anyone else).
 */
export function AvailabilityCard() {
  const session = useSession();
  const providers = useProviders();
  const isManager =
    session?.user.role === 'OWNER' || session?.user.role === 'ADMIN';
  const [providerId, setProviderId] = useState<string | null>(null);

  // Default to yourself if you are a provider, else the first bookable one.
  useEffect(() => {
    if (providerId || !providers.data?.length) return;
    const me = providers.data.find((p) => p.id === session?.user.id);
    setProviderId((me ?? providers.data[0]).id);
  }, [providers.data, providerId, session?.user.id]);

  const options = isManager
    ? (providers.data ?? [])
    : (providers.data ?? []).filter((p) => p.id === session?.user.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Availability</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Weekly hours per provider (several ranges a day leave a break
            between them) and dated time off. Bookings outside these are refused
            unless the front desk overrides.
          </p>
        </div>
        <Select
          aria-label="Provider"
          className="h-9 w-56"
          value={providerId ?? ''}
          onChange={(e) => setProviderId(e.target.value)}
        >
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.role.charAt(0) + p.role.slice(1).toLowerCase()}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent className="space-y-6">
        {providerId && (
          <ProviderEditor key={providerId} providerId={providerId} />
        )}
      </CardContent>
    </Card>
  );
}

function ProviderEditor({ providerId }: { providerId: string }) {
  const { data, isLoading, error } = useProviderAvailability(providerId);
  const save = useSetWeeklySchedule(providerId);
  const [ranges, setRanges] = useState<WeeklyRange[] | null>(null);

  // Seed the editor from the server once; after that it's local until Save.
  useEffect(() => {
    if (data && ranges === null) setRanges(data.schedule);
  }, [data, ranges]);

  if (isLoading || !data || ranges === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error)
    return (
      <p className="text-sm text-destructive">{(error as Error).message}</p>
    );

  const dirty = JSON.stringify(ranges) !== JSON.stringify(data.schedule);
  const update = (i: number, patch: Partial<WeeklyRange>) =>
    setRanges(ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Weekly hours</h3>
          <span className="text-xs text-muted-foreground">
            {data.source === 'provider' && `Own rules · ${data.timezone}`}
            {data.source === 'clinic' &&
              `Using clinic operating hours · ${data.timezone}`}
            {data.source === 'none' && 'No rules — any time is bookable'}
          </span>
        </div>

        {ranges.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No provider-specific hours. Add a range to override the clinic hours
            for this provider.
          </p>
        )}

        <ul className="space-y-2">
          {ranges.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Weekday"
                className="h-9 w-32"
                value={r.weekday}
                onChange={(e) => update(i, { weekday: Number(e.target.value) })}
              >
                {WEEKDAYS.map((d, idx) => (
                  <option key={d} value={idx}>
                    {d}
                  </option>
                ))}
              </Select>
              <Input
                type="time"
                aria-label="Start"
                className="h-9 w-28"
                value={r.startTime}
                onChange={(e) => update(i, { startTime: e.target.value })}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="time"
                aria-label="End"
                className="h-9 w-28"
                value={r.endTime}
                onChange={(e) => update(i, { endTime: e.target.value })}
              />
              <Select
                aria-label="Slot length"
                className="h-9 w-28"
                value={r.slotMinutes ?? 30}
                onChange={(e) =>
                  update(i, { slotMinutes: Number(e.target.value) })
                }
              >
                {[10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Remove range"
                onClick={() => setRanges(ranges.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRanges([
                ...ranges,
                {
                  weekday: 1,
                  startTime: '08:00',
                  endTime: '12:00',
                  slotMinutes: 30,
                },
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Add range
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setRanges(
                [1, 2, 3, 4, 5].flatMap((weekday) => [
                  {
                    weekday,
                    startTime: '08:00',
                    endTime: '12:00',
                    slotMinutes: 30,
                  },
                  {
                    weekday,
                    startTime: '13:00',
                    endTime: '17:00',
                    slotMinutes: 30,
                  },
                ]),
              )
            }
          >
            Mon–Fri 8–12 / 1–5
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(ranges, { onSuccess: () => setRanges(null) })
            }
          >
            {save.isPending ? 'Saving…' : 'Save hours'}
          </Button>
          {save.error && (
            <span className="self-center text-xs text-destructive">
              {(save.error as Error).message}
            </span>
          )}
        </div>
      </section>

      <TimeOffSection providerId={providerId} timeOff={data.timeOff} />
    </>
  );
}

function TimeOffSection({
  providerId,
  timeOff,
}: {
  providerId: string;
  timeOff: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }>;
}) {
  const add = useAddTimeOff(providerId);
  const remove = useRemoveTimeOff(providerId);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Time off</h3>
      {timeOff.length === 0 && (
        <p className="text-sm text-muted-foreground">No upcoming time off.</p>
      )}
      {timeOff.length > 0 && (
        <ul className="divide-y rounded border bg-card">
          {timeOff.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 p-2 text-sm"
            >
              <span>
                {new Date(t.startsAt).toLocaleString()} →{' '}
                {new Date(t.endsAt).toLocaleString()}
                {t.reason && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t.reason}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Remove time off"
                disabled={remove.isPending}
                onClick={() => remove.mutate(t.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Input
          type="datetime-local"
          aria-label="Time off starts"
          className="h-9 w-52"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        <Input
          type="datetime-local"
          aria-label="Time off ends"
          className="h-9 w-52"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
        <Input
          placeholder="Reason (optional)"
          className="h-9 w-48"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!startsAt || !endsAt || add.isPending}
          onClick={() =>
            add.mutate(
              { startsAt, endsAt, reason: reason || undefined },
              {
                onSuccess: () => {
                  setStartsAt('');
                  setEndsAt('');
                  setReason('');
                },
              },
            )
          }
        >
          Add time off
        </Button>
      </div>
      {(add.error ?? remove.error) && (
        <p className="text-xs text-destructive">
          {((add.error ?? remove.error) as Error).message}
        </p>
      )}
    </section>
  );
}
