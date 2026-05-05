'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  teleControllerPollSignals,
  teleControllerPollSignalsProvider,
  teleControllerPostSignalPatient,
  teleControllerPostSignalProvider,
} from '@org/api-client';
import type {
  IceConfig,
  TeleRole,
  TeleSignal,
  TeleSignalKind,
} from '../schemas/tele';

type Auth = { kind: 'provider' } | { kind: 'patient'; token: string };

type Phase =
  | 'idle'
  | 'requesting-media'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'error';

interface UseWebRtcRoomArgs {
  sessionId: string;
  role: TeleRole;
  auth: Auth;
  iceConfig: IceConfig | null;
  /** When true, set up RTCPeerConnection. Doctor is always polite (initiator). */
  enabled: boolean;
}

const POLL_INTERVAL_MS = 1500;

/**
 * Doctor↔patient WebRTC room. The DOCTOR side is the initiator and sends the
 * first OFFER once the PATIENT's JOIN signal arrives. Both sides exchange ICE
 * candidates as they trickle.
 *
 * Signaling uses short-poll HTTP — every POLL_INTERVAL_MS we GET signals after
 * the last seen seq. Acceptable latency for setup; once peers connect, media
 * flows P2P (or via TURN) without server hops.
 */
export function useWebRtcRoom({
  sessionId,
  role,
  auth,
  iceConfig,
  enabled,
}: UseWebRtcRoomArgs) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [chat, setChat] = useState<Array<{ from: TeleRole; text: string; at: string }>>([]);
  // Recording-consent flow:
  //   patient sees `pendingConsent=true` when doctor sends CONSENT_REQUEST
  //   doctor sees `consentResponse: boolean | null` after patient replies
  const [pendingConsent, setPendingConsent] = useState(false);
  const [consentResponse, setConsentResponse] = useState<boolean | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const lastSeqRef = useRef(0);
  const pollHandle = useRef<number | null>(null);
  const remoteSetRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const send = useCallback(
    async (kind: TeleSignalKind, payload: Record<string, unknown>) => {
      try {
        if (auth.kind === 'provider') {
          await teleControllerPostSignalProvider({
            path: { id: sessionId },
            body: { kind, payload },
          });
        } else {
          await teleControllerPostSignalPatient({
            path: { id: sessionId },
            body: { kind, payload },
            headers: { 'X-Tele-Token': auth.token },
          });
        }
      } catch (err) {
        console.error('[tele] send failed', err);
      }
    },
    [sessionId, auth],
  );

  // ── Setup peer connection + local media ──────────
  useEffect(() => {
    if (!enabled || !iceConfig) return;
    let cancelled = false;
    setPhase('requesting-media');
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalStream(stream);

        const pc = new RTCPeerConnection({ iceServers: iceConfig.iceServers });
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (e) => {
          const incoming = e.streams[0] ?? new MediaStream([e.track]);
          setRemoteStream(incoming);
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            void send('ICE', { candidate: e.candidate.toJSON() });
          }
        };
        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          if (state === 'connected') setPhase('connected');
          else if (state === 'disconnected') setPhase('reconnecting');
          else if (state === 'failed' || state === 'closed') setPhase('ended');
        };

        setPhase('connecting');
        // Patient announces JOIN; doctor will then create the offer.
        if (role === 'PATIENT') {
          await send('JOIN', {});
        }
      } catch (err) {
        console.error('[tele] media error', err);
        setError((err as Error).message);
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      pcRef.current?.close();
      pcRef.current = null;
      localStream?.getTracks().forEach((t) => t.stop());
      setRemoteStream(null);
    };
  }, [enabled, iceConfig, role]);

  // ── Polling loop ─────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const signals = await fetchSignals(sessionId, lastSeqRef.current, auth);
        for (const sig of signals) {
          lastSeqRef.current = Math.max(lastSeqRef.current, sig.seq);
          if (sig.fromRole === role) continue; // ignore our own echoes
          await handleSignal(sig);
        }
      } catch (err) {
        console.error('[tele] poll error', err);
      }
      if (alive) {
        pollHandle.current = window.setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    pollHandle.current = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      if (pollHandle.current !== null) window.clearTimeout(pollHandle.current);
    };
  }, [enabled, sessionId, role, auth.kind, auth.kind === 'patient' ? auth.token : '']);

  const drainPending = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch (err) {
        console.warn('[tele] queued addIceCandidate failed', err);
      }
    }
  }, []);

  const handleSignal = useCallback(
    async (sig: TeleSignal) => {
      const pc = pcRef.current;
      if (!pc) return;
      if (sig.kind === 'JOIN' && role === 'DOCTOR') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await send('OFFER', { sdp: offer });
      } else if (sig.kind === 'OFFER' && role === 'PATIENT') {
        const offer = sig.payload['sdp'] as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(offer);
        remoteSetRef.current = true;
        await drainPending();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await send('ANSWER', { sdp: answer });
      } else if (sig.kind === 'ANSWER' && role === 'DOCTOR') {
        const answer = sig.payload['sdp'] as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(answer);
        remoteSetRef.current = true;
        await drainPending();
      } else if (sig.kind === 'ICE') {
        const candidate = sig.payload['candidate'] as RTCIceCandidateInit;
        if (!remoteSetRef.current) {
          pendingCandidatesRef.current.push(candidate);
        } else {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.warn('[tele] addIceCandidate failed', err);
          }
        }
      } else if (sig.kind === 'CHAT') {
        setChat((prev) => [
          ...prev,
          {
            from: sig.fromRole,
            text: String(sig.payload['text'] ?? ''),
            at: sig.createdAt,
          },
        ]);
      } else if (sig.kind === 'CONSENT_REQUEST' && role === 'PATIENT') {
        setPendingConsent(true);
      } else if (sig.kind === 'CONSENT_RESPONSE' && role === 'DOCTOR') {
        setConsentResponse(Boolean(sig.payload['granted']));
      } else if (sig.kind === 'LEAVE') {
        setPhase('ended');
      }
    },
    [role, send, drainPending],
  );

  /** Doctor only: ask the patient for permission to record this session. */
  const requestRecordingConsent = useCallback(() => {
    if (role !== 'DOCTOR') return;
    setConsentResponse(null);
    void send('CONSENT_REQUEST', {});
  }, [role, send]);

  /**
   * Patient only: respond to the recording-consent prompt. Sends the
   * CONSENT_RESPONSE signal AND POSTs the dedicated /recording-consent
   * endpoint so the consent ledger gets a server-side timestamp (audit-grade).
   */
  const respondRecordingConsent = useCallback(
    async (granted: boolean) => {
      if (role !== 'PATIENT' || auth.kind !== 'patient') return;
      setPendingConsent(false);
      void send('CONSENT_RESPONSE', { granted });
      try {
        const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
        await fetch(`${base}/api/tele/sessions/${sessionId}/recording-consent`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-Tele-Token': auth.token,
          },
          body: JSON.stringify({ granted }),
        });
      } catch (err) {
        console.warn('[tele] consent stamp failed', err);
      }
    },
    [role, send, sessionId, auth],
  );

  const sendChat = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      setChat((prev) => [...prev, { from: role, text, at: new Date().toISOString() }]);
      void send('CHAT', { text });
    },
    [role, send],
  );

  const hangUp = useCallback(async () => {
    await send('LEAVE', {});
    pcRef.current?.close();
    pcRef.current = null;
    localStream?.getTracks().forEach((t) => t.stop());
    setRemoteStream(null);
    setPhase('ended');
  }, [send, localStream]);

  return {
    phase,
    error,
    localStream,
    remoteStream,
    chat,
    sendChat,
    hangUp,
    pendingConsent,
    consentResponse,
    requestRecordingConsent,
    respondRecordingConsent,
  };
}

async function fetchSignals(
  sessionId: string,
  since: number,
  auth: Auth,
): Promise<TeleSignal[]> {
  if (auth.kind === 'provider') {
    const { data, error } = await teleControllerPollSignalsProvider({
      path: { id: sessionId },
      query: { since: String(since) },
    });
    if (error || !data) return [];
    return data as unknown as TeleSignal[];
  }
  const { data, error } = await teleControllerPollSignals({
    path: { id: sessionId },
    query: { since: String(since) },
    headers: { 'X-Tele-Token': auth.token },
  });
  if (error || !data) return [];
  return data as unknown as TeleSignal[];
}

