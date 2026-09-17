'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
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
  useCloseLabDispute,
  useLabDisputes,
  useOpenLabDispute,
  usePostLabDisputeMessage,
} from '../hooks/use-lab';
import type {
  LabCaseDispute,
  LabCaseDisputeKind,
  LabCaseDisputeStatus,
} from '../lib/api';

const KIND_LABEL: Record<LabCaseDisputeKind, string> = {
  QUALITY: 'Quality / fit',
  BILLING: 'Billing',
  DELIVERY: 'Delivery',
  OTHER: 'Other',
};

const STATUS_COLOR: Record<LabCaseDisputeStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  RESOLVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  WITHDRAWN: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
};

export function DisputesPanel({
  caseId,
  side,
  myUserId,
}: {
  caseId: string;
  side: 'lab' | 'clinic';
  /** Currently signed-in user id — used to label "you" on messages. */
  myUserId?: string;
}) {
  const { data, isLoading, error } = useLabDisputes(side, caseId);
  const [showOpen, setShowOpen] = useState(false);
  const open = useOpenLabDispute(side);
  const hasOpenDispute = (data ?? []).some((d) => d.status === 'OPEN');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" aria-hidden /> Disputes
          </span>
          {!hasOpenDispute && (
            <Button size="sm" variant="outline" onClick={() => setShowOpen((v) => !v)}>
              {showOpen ? 'Cancel' : 'Open dispute'}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}
        {showOpen && !hasOpenDispute && (
          <OpenForm
            onSubmit={(input) =>
              open.mutate(
                { caseId, ...input },
                { onSuccess: () => setShowOpen(false) },
              )
            }
            onCancel={() => setShowOpen(false)}
            pending={open.isPending}
            error={open.error as Error | null}
          />
        )}
        {data && data.length === 0 && !showOpen && (
          <p className="text-sm text-muted-foreground">
            No disputes on this case.
          </p>
        )}
        {data?.map((d) => (
          <DisputeRow key={d.id} dispute={d} side={side} myUserId={myUserId} />
        ))}
      </CardContent>
    </Card>
  );
}

function OpenForm({
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  onSubmit: (input: { kind: LabCaseDisputeKind; reason: string }) => void;
  onCancel: () => void;
  pending: boolean;
  error: Error | null;
}) {
  const [kind, setKind] = useState<LabCaseDisputeKind>('QUALITY');
  const [reason, setReason] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    onSubmit({ kind, reason: reason.trim() });
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-md border bg-muted/20 p-3"
    >
      <div className="grid gap-2 md:grid-cols-[200px,1fr]">
        <Select value={kind} onChange={(e) => setKind(e.target.value as LabCaseDisputeKind)}>
          {(Object.keys(KIND_LABEL) as LabCaseDisputeKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <Input
          required
          placeholder="What's wrong?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error.message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Opening…' : 'Open dispute'}
        </Button>
      </div>
    </form>
  );
}

function DisputeRow({
  dispute,
  side,
  myUserId,
}: {
  dispute: LabCaseDispute;
  side: 'lab' | 'clinic';
  myUserId?: string;
}) {
  const post = usePostLabDisputeMessage(side, dispute.id);
  const close = useCloseLabDispute(side, dispute.id);
  const [body, setBody] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [showCloseUI, setShowCloseUI] = useState(false);

  const canPost = dispute.status === 'OPEN';
  const canClose = dispute.status === 'OPEN';
  const canWithdraw = canClose && dispute.openedByUserId === myUserId;

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    post.mutate(body.trim(), { onSuccess: () => setBody('') });
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{KIND_LABEL[dispute.kind]}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[dispute.status]}`}
            >
              {dispute.status}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Opened {new Date(dispute.createdAt).toLocaleString()}
          </div>
        </div>
        {canClose && !showCloseUI && (
          <Button size="sm" variant="outline" onClick={() => setShowCloseUI(true)}>
            Close dispute
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm">{dispute.reason}</p>

      {dispute.messages.length > 0 && (
        <ul className="mt-3 space-y-2 border-t pt-2">
          {dispute.messages.map((m) => {
            const mine = myUserId && m.senderUserId === myUserId;
            return (
              <li key={m.id} className="text-sm">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {mine ? 'You' : 'Other party'} · {new Date(m.createdAt).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </li>
            );
          })}
        </ul>
      )}

      {canPost && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Reply…"
          />
          <Button type="submit" size="sm" disabled={post.isPending || !body.trim()}>
            Send
          </Button>
        </form>
      )}

      {showCloseUI && (
        <div className="mt-3 space-y-2 rounded-md border bg-muted/20 p-2">
          <Input
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder="Resolution notes (optional)"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCloseUI(false)}
              disabled={close.isPending}
            >
              Cancel
            </Button>
            {canWithdraw && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  close.mutate(
                    { status: 'WITHDRAWN', notes: closeNotes || undefined },
                    { onSuccess: () => setShowCloseUI(false) },
                  )
                }
                disabled={close.isPending}
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden /> Withdraw
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                close.mutate(
                  { status: 'REJECTED', notes: closeNotes || undefined },
                  { onSuccess: () => setShowCloseUI(false) },
                )
              }
              disabled={close.isPending}
            >
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() =>
                close.mutate(
                  { status: 'RESOLVED', notes: closeNotes || undefined },
                  { onSuccess: () => setShowCloseUI(false) },
                )
              }
              disabled={close.isPending}
            >
              <CheckCircle className="mr-1 h-3.5 w-3.5" aria-hidden /> Resolve
            </Button>
          </div>
        </div>
      )}

      {dispute.status !== 'OPEN' && dispute.resolutionNotes && (
        <div className="mt-3 border-t pt-2 text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {dispute.status} on {dispute.resolvedAt && new Date(dispute.resolvedAt).toLocaleString()}
          </span>
          <p className="mt-1 whitespace-pre-wrap">{dispute.resolutionNotes}</p>
        </div>
      )}
    </div>
  );
}
