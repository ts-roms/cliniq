'use client';

import { useState } from 'react';
import { Button } from '@org/ui';
import { useMarkAllRead, useNotifications } from '../hooks/use-notifications';
import { NotificationRow } from './notification-row';

export function NotificationsList() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useNotifications(unreadOnly);
  const markAll = useMarkAllRead();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setUnreadOnly(false)}
            className={`rounded-full px-3 py-1 text-xs ${
              !unreadOnly
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setUnreadOnly(true)}
            className={`rounded-full px-3 py-1 text-xs ${
              unreadOnly
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            Unread
          </button>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          Mark all read
        </Button>
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.data && list.data.length === 0 && (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}
        </p>
      )}
      {list.data && list.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card divide-y">
          {list.data.map((n) => (
            <NotificationRow key={n.id} notification={n} />
          ))}
        </div>
      )}
    </div>
  );
}
