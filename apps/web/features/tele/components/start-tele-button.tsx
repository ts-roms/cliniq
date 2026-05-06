'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import type { ProviderSession } from '../schemas/tele';
import {
  useCreateTeleSession,
  useEndTeleSession,
  useNotifyPatientBySms,
} from '../hooks/use-tele-session';
import { TeleRoom } from './tele-room';

export function StartTelePanel({
  patientId,
  consultationId,
  patientName,
}: {
  patientId: string;
  consultationId?: string;
  patientName?: string;
}) {
  const create = useCreateTeleSession();
  const end = useEndTeleSession();
  const notify = useNotifyPatientBySms();
  const [session, setSession] = useState<ProviderSession | null>(null);
  const [inRoom, setInRoom] = useState(false);

  const start = async () => {
    const s = await create.mutateAsync({ patientId, consultationId });
    setSession(s);
  };

  const leave = async () => {
    if (session) await end.mutateAsync(session.id);
    setInRoom(false);
    setSession(null);
    notify.reset();
  };

  const sendSms = async () => {
    if (!session) return;
    await notify.mutateAsync(session.id);
  };

  if (inRoom && session) {
    return (
      <TeleRoom
        sessionId={session.id}
        role="DOCTOR"
        onLeave={leave}
        remoteName={patientName}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telemedicine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!session && (
          <>
            <p className="text-sm text-muted-foreground">
              Start a 1:1 video call with this patient. They'll receive a join
              link to open in their browser — no app install or portal account needed.
            </p>
            <Button onClick={start} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Start tele call'}
            </Button>
            {create.error && (
              <p className="text-xs text-destructive">{(create.error as Error).message}</p>
            )}
          </>
        )}
        {session && (
          <>
            <div className="rounded border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Share this link with the patient:</p>
              <code className="mt-1 block break-all rounded bg-card px-2 py-1 text-xs">
                {session.joinUrl || `/portal/tele/${session.joinToken}`}
              </code>
              <p className="mt-2 text-[11px] text-muted-foreground">
                A join link was auto-sent by SMS to the patient on file. Use the
                buttons below if you need to copy or re-send it.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      session.joinUrl ||
                        `${window.location.origin}/portal/tele/${session.joinToken}`,
                    );
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Copy link
                </button>
                <button
                  onClick={sendSms}
                  disabled={notify.isPending}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {notify.isPending ? 'Sending…' : 'Send via SMS'}
                </button>
                {notify.data && (
                  <span
                    className={`text-[11px] ${
                      notify.data.sent ? 'text-emerald-600' : 'text-amber-700'
                    }`}
                  >
                    {notify.data.sent
                      ? `Sent via ${notify.data.provider}`
                      : `Not sent — ${notify.data.reason ?? 'unknown reason'}`}
                  </span>
                )}
                {notify.error && (
                  <span className="text-[11px] text-destructive">
                    {(notify.error as Error).message}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setInRoom(true)}>Join now</Button>
              <Button variant="outline" onClick={() => setSession(null)}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
