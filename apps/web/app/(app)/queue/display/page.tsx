'use client';

import { useQuery } from '@tanstack/react-query';

interface Queue {
  id: string;
  kind: string;
  name: string | null;
  numberPrefix: string;
}
interface Ticket {
  id: string;
  queueId: string;
  numberLabel: string;
  status: string;
  label: string | null;
  priority: number;
  calledAt: string | null;
}

const KIND_LABEL: Record<string, string> = {
  WALK_IN: 'Walk-in',
  APPOINTMENT: 'Appointment',
  DRIVE_THRU: 'Drive-thru',
  PRIORITY: 'Priority',
};

/**
 * Public TV display screen. Auto-refreshes every 5s. Designed for
 * fullscreen on a 1080p TV: huge "Now Serving" numbers, smaller "Up Next"
 * column. The page deliberately avoids the staff-app shell — open it
 * directly via /queue/display in a browser, hit F11 for fullscreen.
 */
export default function QueueDisplayPage() {
  const display = useQuery({
    queryKey: ['queue', 'display'],
    refetchInterval: 5000,
    queryFn: async (): Promise<Array<{ queue: Queue; tickets: Ticket[] }>> => {
      const res = await fetch(
        `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'}/api/queue/display`,
        {
          headers: {
            authorization: `Bearer ${typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('cliniq.session') ?? '{}').accessToken ?? '') : ''}`,
          },
        },
      );
      if (!res.ok) throw new Error(`feed ${res.status}`);
      return (await res.json()) as Array<{ queue: Queue; tickets: Ticket[] }>;
    },
  });

  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Now serving</h1>
          <span className="text-sm text-zinc-400">
            Updated {new Date().toLocaleTimeString()}
          </span>
        </div>

        {display.isLoading && (
          <p className="text-zinc-400">Loading queue…</p>
        )}
        {display.error && (
          <p className="text-rose-400">{(display.error as Error).message}</p>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(display.data ?? []).map(({ queue, tickets }) => (
            <QueueColumn key={queue.id} queue={queue} tickets={tickets} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QueueColumn({ queue, tickets }: { queue: Queue; tickets: Ticket[] }) {
  const called = tickets.filter((t) => t.status === 'CALLED').slice(0, 1)[0];
  const upcoming = tickets.filter((t) => t.status === 'WAITING').slice(0, 5);

  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-900 shadow-lg">
      <div className="border-b border-zinc-800 bg-zinc-900/80 px-6 py-4">
        <div className="text-xs uppercase tracking-widest text-zinc-400">
          {KIND_LABEL[queue.kind] ?? queue.kind}
        </div>
        <div className="text-lg font-semibold">{queue.name ?? KIND_LABEL[queue.kind]}</div>
      </div>
      <div className="px-6 py-8 text-center">
        {called ? (
          <>
            <div className="text-xs uppercase tracking-widest text-zinc-500">
              Now serving
            </div>
            <div className="mt-2 font-mono text-7xl font-bold text-white">
              {called.numberLabel}
            </div>
          </>
        ) : (
          <div className="py-10 text-zinc-600">— No ticket called —</div>
        )}
      </div>
      <div className="border-t border-zinc-800 px-6 py-4">
        <div className="text-xs uppercase tracking-widest text-zinc-500">
          Up next
        </div>
        <ul className="mt-2 space-y-1">
          {upcoming.length === 0 && (
            <li className="text-sm text-zinc-600">—</li>
          )}
          {upcoming.map((t) => (
            <li key={t.id} className="flex items-center justify-between">
              <span className="font-mono text-base text-zinc-200">
                {t.numberLabel}
              </span>
              {t.priority > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                  PRIORITY
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
