'use client';

import Link from 'next/link';
import type { Notification, NotificationSeverity } from '../schemas/notification';
import { useMarkRead } from '../hooks/use-notifications';

const SEV_TONE: Record<NotificationSeverity, string> = {
  INFO: 'border-l-blue-400',
  WARNING: 'border-l-amber-400',
  CRITICAL: 'border-l-rose-500',
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationRow({ notification: n }: { notification: Notification }) {
  const markRead = useMarkRead();
  const onClick = () => {
    if (!n.readAt) markRead.mutate(n.id);
  };
  const body = (
    <div
      className={`flex items-start gap-3 border-l-4 px-3 py-2 ${SEV_TONE[n.severity]} ${
        n.readAt ? 'bg-card text-muted-foreground' : 'bg-muted/30'
      }`}
    >
      <div className="flex-1 space-y-0.5">
        <p className={`text-sm ${n.readAt ? '' : 'font-medium'}`}>{n.title}</p>
        {n.body && <p className="text-xs">{n.body}</p>}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {n.kind.replace(/_/g, ' ').toLowerCase()} · {timeAgo(n.createdAt)}
        </p>
      </div>
      {!n.readAt && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
    </div>
  );
  if (n.link) {
    return (
      <Link href={n.link} onClick={onClick} className="block hover:bg-muted/40">
        {body}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className="block w-full text-left hover:bg-muted/40">
      {body}
    </button>
  );
}
