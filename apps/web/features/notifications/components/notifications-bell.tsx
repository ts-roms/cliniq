'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@org/ui';
import {
  useMarkAllRead,
  useNotifications,
  useUnreadCount,
} from '../hooks/use-notifications';
import { NotificationRow } from './notification-row';

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const count = useUnreadCount();
  const list = useNotifications();
  const markAll = useMarkAllRead();
  const unread = count.data ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-medium text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-96 overflow-hidden rounded-lg border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notifications
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={unread === 0 || markAll.isPending}
                onClick={() => markAll.mutate()}
              >
                Mark all read
              </Button>
            </div>
            <div className="max-h-96 divide-y overflow-y-auto">
              {list.isLoading && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
              )}
              {list.data && list.data.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No notifications.
                </p>
              )}
              {list.data?.slice(0, 8).map((n) => (
                <NotificationRow key={n.id} notification={n} />
              ))}
            </div>
            <div className="border-t px-3 py-2 text-center">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-primary hover:underline"
              >
                See all
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
