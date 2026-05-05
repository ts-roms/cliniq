'use client';

import { useState } from 'react';
import { Button } from '@org/ui';
import { useAudioRecorder } from '../hooks/use-audio-recorder';
import { useTranscribeAudio } from '../hooks/use-transcribe';

interface Props {
  disabled: boolean;
  onTranscript: (text: string) => void;
}

export function AudioRecorder({ disabled, onTranscript }: Props) {
  const recorder = useAudioRecorder();
  const transcribe = useTranscribeAudio();
  const [lastError, setLastError] = useState<string | null>(null);

  if (!recorder.isSupported) {
    return (
      <p className="text-xs text-muted-foreground">
        Audio recording isn&apos;t supported in this browser. Type the transcript instead.
      </p>
    );
  }

  const handleStop = async () => {
    setLastError(null);
    const recording = await recorder.stop();
    if (!recording) return;
    try {
      const result = await transcribe.mutateAsync(recording);
      onTranscript(result.transcript);
    } catch (err) {
      setLastError((err as Error).message);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {recorder.isRecording ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleStop}
              disabled={disabled || transcribe.isPending}
            >
              {transcribe.isPending ? 'Transcribing…' : 'Stop'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={recorder.cancel}
              disabled={transcribe.isPending}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={recorder.start}
            disabled={disabled || transcribe.isPending}
          >
            {transcribe.isPending ? 'Transcribing…' : 'Record audio'}
          </Button>
        )}
        {recorder.isRecording && (
          <span className="text-xs tabular-nums text-muted-foreground">
            ● Recording {formatDuration(recorder.durationSec)}
          </span>
        )}
      </div>
      {recorder.error && (
        <p className="text-xs text-destructive">Mic: {recorder.error}</p>
      )}
      {lastError && <p className="text-xs text-destructive">{lastError}</p>}
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
