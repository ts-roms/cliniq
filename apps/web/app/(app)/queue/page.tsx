'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, Tv, UserPlus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from '@org/ui';
import {
  queueControllerCallNext,
  queueControllerClose,
  queueControllerCreateQueue,
  queueControllerIssue,
  queueControllerListQueues,
} from '@org/api-client';

interface Queue {
  id: string;
  kind: string;
  name: string | null;
  numberPrefix: string;
  isActive: boolean;
}

interface Ticket {
  id: string;
  queueId: string;
  numberLabel: string;
  status: string;
  label: string | null;
  priority: number;
  issuedAt: string;
  calledAt: string | null;
}

const KIND_LABEL: Record<string, string> = {
  WALK_IN: 'Walk-in',
  APPOINTMENT: 'Appointment',
  DRIVE_THRU: 'Drive-thru',
  PRIORITY: 'Priority',
};

const STATUS_TONE: Record<string, string> = {
  WAITING: 'bg-blue-100 text-blue-800',
  CALLED: 'bg-amber-100 text-amber-800',
  SERVED: 'bg-emerald-100 text-emerald-800',
  NO_SHOW: 'bg-zinc-200 text-zinc-700',
  CANCELLED: 'bg-zinc-200 text-zinc-500',
};

export default function QueuePage() {
  const qc = useQueryClient();
  const queues = useQuery({
    queryKey: ['queue', 'queues'],
    queryFn: async (): Promise<Queue[]> => {
      const { data, error } = await queueControllerListQueues();
      if (error || !data) throw new Error('Failed to load queues');
      return data as unknown as Queue[];
    },
  });
  const display = useQuery({
    queryKey: ['queue', 'display-staff'],
    refetchInterval: 5000,
    queryFn: async (): Promise<Array<{ queue: Queue; tickets: Ticket[] }>> => {
      // Reuse the display feed for the staff page — same shape, refetched
      // every 5s so "next ticket" + "called" updates appear without action.
      const res = await fetch(
        `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'}/api/queue/display`,
        {
          credentials: 'omit',
          headers: {
            authorization: `Bearer ${typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('cliniq.session') ?? '{}').accessToken ?? '') : ''}`,
          },
        },
      );
      if (!res.ok) throw new Error(`feed ${res.status}`);
      return (await res.json()) as Array<{ queue: Queue; tickets: Ticket[] }>;
    },
  });

  const [showNew, setShowNew] = useState(false);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Patient queue</h1>
          <p className="text-sm text-muted-foreground">
            Issue tickets, call the next patient, and close the line as
            patients are served.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/queue/display" target="_blank">
              <Tv className="mr-2 h-4 w-4" aria-hidden /> Display screen
            </Link>
          </Button>
          <Button onClick={() => setShowNew((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {showNew ? 'Cancel' : 'New queue'}
          </Button>
        </div>
      </div>

      {showNew && <NewQueueForm onDone={() => setShowNew(false)} />}

      {queues.isLoading && (
        <p className="text-sm text-muted-foreground">Loading queues…</p>
      )}
      {queues.error && (
        <p className="text-sm text-destructive">
          {(queues.error as Error).message}
        </p>
      )}

      {(display.data ?? []).map((row) => (
        <QueueCard key={row.queue.id} queue={row.queue} tickets={row.tickets} />
      ))}

      {queues.data && queues.data.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No queues yet. Create one to start issuing tickets.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  function QueueCard({ queue, tickets }: { queue: Queue; tickets: Ticket[] }) {
    const waiting = tickets.filter((t) => t.status === 'WAITING');
    const called = tickets.filter((t) => t.status === 'CALLED');
    const servedToday = tickets.filter((t) => t.status === 'SERVED').length;

    const callNext = useMutation({
      mutationFn: async () => {
        const { data, error } = await queueControllerCallNext({
          path: { id: queue.id },
        });
        if (error) throw new Error('No waiting tickets');
        return data;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
    });

    const close = useMutation({
      mutationFn: async (input: { id: string; status: 'SERVED' | 'NO_SHOW' | 'CANCELLED' }) => {
        const { data, error } = await queueControllerClose({
          path: { id: input.id },
          body: { status: input.status } as never,
        });
        if (error) throw new Error('failed');
        return data;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {queue.name ?? KIND_LABEL[queue.kind] ?? queue.kind}{' '}
              <span className="text-xs text-muted-foreground">
                ({queue.numberPrefix}- · {KIND_LABEL[queue.kind]})
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Waiting: <b className="text-foreground">{waiting.length}</b></span>
              <span>Called: <b className="text-foreground">{called.length}</b></span>
              <span>Served today: <b className="text-foreground">{servedToday}</b></span>
              <Button
                size="sm"
                onClick={() => callNext.mutate()}
                disabled={callNext.isPending || waiting.length === 0}
              >
                <ChevronRight className="mr-1 h-4 w-4" aria-hidden /> Call next
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IssueTicketRow queueId={queue.id} />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <TicketColumn
              title="Now serving"
              tickets={called}
              onAction={(id, status) => close.mutate({ id, status })}
              showActions
            />
            <TicketColumn
              title="Up next"
              tickets={waiting.slice(0, 8)}
              onAction={(id, status) => close.mutate({ id, status })}
            />
          </div>
        </CardContent>
      </Card>
    );
  }
}

function TicketColumn({
  title,
  tickets,
  onAction,
  showActions,
}: {
  title: string;
  tickets: Ticket[];
  onAction: (id: string, status: 'SERVED' | 'NO_SHOW' | 'CANCELLED') => void;
  showActions?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1 rounded-md border">
        {tickets.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">—</p>
        )}
        {tickets.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between border-b px-3 py-2 last:border-0"
          >
            <div>
              <span className="font-mono text-sm font-semibold">
                {t.numberLabel}
              </span>
              {t.label && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t.label}
                </span>
              )}
              {t.priority > 0 && (
                <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  PRIORITY
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[t.status]}`}
              >
                {t.status}
              </span>
              {showActions && (
                <>
                  <Button size="sm" variant="outline" onClick={() => onAction(t.id, 'SERVED')}>
                    Served
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onAction(t.id, 'NO_SHOW')}>
                    No-show
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueTicketRow({ queueId }: { queueId: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const issue = useMutation({
    mutationFn: async () => {
      const { data, error } = await queueControllerIssue({
        body: { queueId, label: label || undefined, phone: phone || undefined } as never,
      });
      if (error) throw new Error('Failed');
      return data;
    },
    onSuccess: () => {
      setLabel('');
      setPhone('');
      qc.invalidateQueries({ queryKey: ['queue'] });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        issue.mutate();
      }}
      className="grid gap-2 md:grid-cols-[1fr,200px,auto]"
    >
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Patient label (e.g. Maria, BP check)"
      />
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional, for SMS)"
      />
      <Button type="submit" disabled={issue.isPending}>
        <UserPlus className="mr-1 h-4 w-4" aria-hidden /> Issue
      </Button>
    </form>
  );
}

function NewQueueForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<'WALK_IN' | 'APPOINTMENT' | 'DRIVE_THRU' | 'PRIORITY'>('WALK_IN');
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('A');

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await queueControllerCreateQueue({
        body: { kind, name: name || undefined, numberPrefix: prefix } as never,
      });
      if (error) throw new Error('Failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      onDone();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>New queue</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="grid gap-3 md:grid-cols-[200px,1fr,100px,auto]"
        >
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="WALK_IN">Walk-in</option>
            <option value="APPOINTMENT">Appointment</option>
            <option value="DRIVE_THRU">Drive-thru</option>
            <option value="PRIORITY">Priority (senior / PWD)</option>
          </Select>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name (optional)"
          />
          <Input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="A"
          />
          <Button type="submit" disabled={create.isPending}>
            Create
          </Button>
          {create.error && (
            <p className="md:col-span-4 text-xs text-destructive">
              {(create.error as Error).message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
