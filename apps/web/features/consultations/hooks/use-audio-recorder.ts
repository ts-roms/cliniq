'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioRecording {
  blob: Blob;
  durationSec: number;
  mimeType: string;
}

interface State {
  isRecording: boolean;
  isSupported: boolean;
  durationSec: number;
  error: string | null;
}

const PREFERRED_MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return PREFERRED_MIME.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function useAudioRecorder() {
  const [state, setState] = useState<State>(() => ({
    isRecording: false,
    isSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices && !!pickMime(),
    durationSec: 0,
    error: null,
  }));

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Cleanup on unmount only.
  useEffect(() => () => {
    stopTick();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, [stopTick]);

  const start = useCallback(async () => {
    if (state.isRecording || !state.isSupported) return;
    setState((s) => ({ ...s, error: null, durationSec: 0 }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime() ?? 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      tickRef.current = setInterval(() => {
        setState((s) => ({ ...s, durationSec: Math.floor((Date.now() - startedAtRef.current) / 1000) }));
      }, 1000);
      setState((s) => ({ ...s, isRecording: true }));
    } catch (err) {
      setState((s) => ({ ...s, error: (err as Error).message }));
    }
  }, [state.isRecording, state.isSupported]);

  const stop = useCallback(async (): Promise<AudioRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;

    const finished = new Promise<AudioRecording>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const durationSec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        recorder.stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        resolve({ blob, durationSec, mimeType });
      };
    });

    recorder.stop();
    stopTick();
    setState((s) => ({ ...s, isRecording: false }));
    return finished;
  }, [stopTick]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    chunksRef.current = [];
    stopTick();
    setState({ ...state, isRecording: false, durationSec: 0 });
  }, [state, stopTick]);

  return { ...state, start, stop, cancel };
}
