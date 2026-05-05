'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@org/ui';
import { useSession } from '@/features/auth';
import { useIssueFeedToken } from './use-feed-token';

/**
 * Generates a signed ICS feed URL for the current user's calendar (or for an
 * arbitrary provider if OWNER/ADMIN). The URL is RFC 5545 compatible — paste
 * into Google/Outlook/Apple Calendar as a subscribed calendar.
 */
export function SubscribeFeedButton({ providerId }: { providerId?: string }) {
  const session = useSession();
  const target = providerId ?? session?.user.id ?? '';
  const issue = useIssueFeedToken();
  const [open, setOpen] = useState(false);

  const generate = async () => {
    if (!target) return;
    await issue.mutateAsync(target);
  };

  const url = issue.data?.feedUrl ?? '';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !issue.data) void generate();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Subscribe URL
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Calendar subscribe URL</DialogTitle>
          <DialogDescription>
            Paste this URL into Google Calendar (Other calendars → From URL),
            Outlook, or Apple Calendar. Refreshes automatically.
          </DialogDescription>
        </DialogHeader>
        {issue.isPending && <p className="text-sm text-muted-foreground">Generating…</p>}
        {issue.error && (
          <p className="text-sm text-destructive">{(issue.error as Error).message}</p>
        )}
        {url && (
          <div className="space-y-2">
            <code className="block break-all rounded bg-muted/40 p-2 text-xs">{url}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(url)}
            >
              Copy URL
            </Button>
            <p className="text-xs text-muted-foreground">
              Anyone with this URL can read the appointments. Treat it like a password —
              if leaked, rotate the server's JWT_SECRET to invalidate all feeds.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
