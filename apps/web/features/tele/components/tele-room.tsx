'use client';

import { Button } from '@org/ui';
import type { TeleRole } from '../schemas/tele';
import { useIceConfig } from '../hooks/use-tele-session';
import { useWebRtcRoom } from '../hooks/use-webrtc-room';
import { VideoTile } from './video-tile';
import { ChatPane } from './chat-pane';

const PHASE_LABEL: Record<string, string> = {
  idle: 'Connecting…',
  'requesting-media': 'Requesting camera + mic…',
  connecting: 'Negotiating…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  ended: 'Call ended',
  error: 'Error',
};

export function TeleRoom({
  sessionId,
  role,
  patientToken,
  onLeave,
  remoteName,
}: {
  sessionId: string;
  role: TeleRole;
  /** Required for PATIENT role; ignored for DOCTOR. */
  patientToken?: string;
  onLeave: () => void;
  remoteName?: string;
}) {
  const ice = useIceConfig();
  const auth = role === 'DOCTOR' ? { kind: 'provider' as const } : { kind: 'patient' as const, token: patientToken ?? '' };
  const room = useWebRtcRoom({
    sessionId,
    role,
    auth,
    iceConfig: ice.data ?? null,
    enabled: !!ice.data,
  });

  return (
    <div className="grid h-[80vh] grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-3">
        <div className="grid h-full grid-cols-2 gap-3">
          <VideoTile
            stream={room.remoteStream}
            label={remoteName ?? (role === 'DOCTOR' ? 'Patient' : 'Provider')}
          />
          <VideoTile stream={room.localStream} label="You" muted mirror />
        </div>

        {/* Patient: respond to a recording-consent prompt from the doctor. */}
        {role === 'PATIENT' && room.pendingConsent && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
            <p className="font-medium text-amber-900">
              Your provider is asking to record this consultation.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Recordings are stored encrypted and only viewable by your clinic's
              authorized staff. You can decline without affecting the visit.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void room.respondRecordingConsent(true)}>
                Allow recording
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void room.respondRecordingConsent(false)}
              >
                Decline
              </Button>
            </div>
          </div>
        )}

        {/* Doctor: ask for consent + see the patient's reply. */}
        {role === 'DOCTOR' && (
          <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {room.consentResponse === true
                ? '✓ Patient consented to recording'
                : room.consentResponse === false
                  ? '✗ Patient declined recording'
                  : 'No recording-consent request sent yet'}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={room.requestRecordingConsent}
              disabled={room.consentResponse !== null}
            >
              Request to record
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
          <p className="text-sm">
            <span className="font-medium">{PHASE_LABEL[room.phase] ?? room.phase}</span>
            {room.error && <span className="ml-2 text-destructive">{room.error}</span>}
            {room.screenSharing && (
              <span className="ml-2 text-xs text-primary">· sharing screen</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void room.toggleScreenShare()}
              disabled={room.phase !== 'connected' && room.phase !== 'reconnecting'}
            >
              {room.screenSharing ? 'Stop sharing' : 'Share screen'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await room.hangUp();
                onLeave();
              }}
              className="text-destructive hover:text-destructive"
            >
              Leave call
            </Button>
          </div>
        </div>
      </div>
      <ChatPane chat={room.chat} myRole={role} onSend={room.sendChat} />
    </div>
  );
}
