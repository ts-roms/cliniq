'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import type { ProviderSession } from '../schemas/tele';
import { useCreateTeleSession, useEndTeleSession } from '../hooks/use-tele-session';
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
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(session.joinUrl || `${window.location.origin}/portal/tele/${session.joinToken}`);
                }}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Copy link
              </button>
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
