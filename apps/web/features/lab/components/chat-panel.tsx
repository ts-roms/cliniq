'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@org/ui';
import {
  useLabCaseMessages,
  useSendLabCaseMessage,
} from '../hooks/use-lab';
import { useSession } from '@/features/auth';

interface Props {
  caseId: string;
  side: 'lab' | 'clinic';
}

/**
 * Per-case chat. Polls every 5s (configured in useLabCaseMessages).
 * Bubbles align right when the message's senderTenantId matches the
 * caller's tenant — so each side sees their own messages on the right.
 */
export function ChatPanel({ caseId, side }: Props) {
  const session = useSession();
  const { data, isLoading, error } = useLabCaseMessages(caseId, side);
  const send = useSendLabCaseMessage(caseId, side);
  const [draft, setDraft] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    send.mutate(body, { onSuccess: () => setDraft('') });
  }

  return (
    <div className="flex h-[400px] flex-col">
      <div
        ref={scrollerRef}
        className="flex-1 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-3"
      >
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {error && (
          <p className="text-xs text-destructive">{(error as Error).message}</p>
        )}
        {data && data.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No messages yet. Say hi to the {side === 'lab' ? 'clinic' : 'lab'}.
          </p>
        )}
        {data?.map((m) => {
          const mine = m.senderTenantId === session?.user.tenantId;
          return (
            <div
              key={m.id}
              className={'flex ' + (mine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={
                  'max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm ' +
                  (mine
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background')
                }
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p
                  className={
                    'mt-0.5 text-[10px] ' +
                    (mine ? 'text-primary-foreground/70' : 'text-muted-foreground')
                  }
                >
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          disabled={send.isPending}
        />
        <Button type="submit" size="sm" disabled={send.isPending || !draft.trim()}>
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
      {send.error && (
        <p className="mt-1 text-xs text-destructive">
          {(send.error as Error).message}
        </p>
      )}
    </div>
  );
}
