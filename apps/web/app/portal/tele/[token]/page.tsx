'use client';

import { use, useEffect, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import {
  TeleRoom,
  usePatientJoin,
  type PatientJoinResponse,
} from '@/features/tele';

export default function PatientTelePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const join = usePatientJoin();
  const [session, setSession] = useState<PatientJoinResponse | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (tried) return;
    setTried(true);
    join
      .mutateAsync(token)
      .then((s) => setSession(s))
      .catch(() => {
        // error captured in mutation state
      });
  }, [token, tried, join]);

  if (join.isPending || (!session && !join.error)) {
    return (
      <div className="container mx-auto px-4 py-8 sm:px-6 sm:py-12 text-center text-sm text-muted-foreground">
        Connecting to your video visit…
      </div>
    );
  }

  if (join.error) {
    return (
      <div className="container mx-auto px-4 py-8 sm:px-6 sm:py-12">
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <CardTitle>Can't join</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-destructive">{(join.error as Error).message}</p>
            <p className="text-xs text-muted-foreground">
              The link may have expired or the session ended. Contact your clinic.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="container mx-auto space-y-4 px-4 py-4 sm:px-6 sm:py-6">
      <header>
        <h1 className="text-xl font-extralight tracking-tight">
          Video visit with {session.provider.name ?? 'your provider'}
        </h1>
        <p className="text-xs text-muted-foreground">
          Camera + microphone access required. Audio/video stays peer-to-peer between
          you and your provider.
        </p>
      </header>
      <TeleRoom
        sessionId={session.id}
        role="PATIENT"
        patientToken={session.patientToken}
        remoteName={session.provider.name ?? 'Provider'}
        onLeave={() => {
          window.location.assign('/portal/login');
        }}
      />
      <p className="text-center text-xs italic text-muted-foreground">
        Telemedicine consultations are not for medical emergencies. If this is an
        emergency, call 911 (PH: 911 or your local hospital).
      </p>
      <ReturnHomeFallback />
    </div>
  );
}

function ReturnHomeFallback() {
  return (
    <div className="text-center">
      <Button variant="outline" size="sm" onClick={() => window.location.assign('/portal/login')}>
        Return home
      </Button>
    </div>
  );
}
