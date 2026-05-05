'use client';

import { useMutation } from '@tanstack/react-query';
import {
  filesControllerPresign,
  transcriptsControllerTranscribe,
} from '@org/api-client';
import type { AudioRecording } from './use-audio-recorder';

interface TranscribeResult {
  transcript: string;
}

export function useTranscribeAudio() {
  return useMutation({
    mutationFn: async (recording: AudioRecording): Promise<TranscribeResult> => {
      const ext = recording.mimeType.includes('mp4') ? 'm4a' : 'webm';
      const filename = `consult-${Date.now()}.${ext}`;

      // 1. Ask the api for a presigned PUT URL.
      const { data: presignedRaw, error: pErr } = await filesControllerPresign({
        body: {
          category: 'CONSULT_AUDIO',
          filename,
          mimeType: recording.mimeType,
          sizeBytes: recording.blob.size,
        },
      });
      if (pErr || !presignedRaw) throw new Error('Could not get upload URL');
      const presigned = presignedRaw as unknown as {
        fileId: string;
        s3Key: string;
        uploadUrl: string;
        expiresInSec: number;
        headers: Record<string, string>;
      };

      // 2. PUT directly to S3 using the headers the api returned.
      const putRes = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: presigned.headers,
        body: recording.blob,
      });
      if (!putRes.ok) {
        throw new Error(`Upload to S3 failed (${putRes.status})`);
      }

      // 3. Tell the api the upload landed; it confirms with HeadObject and
      //    forwards to ai-service for STT.
      const { data: transcript, error: tErr } = await transcriptsControllerTranscribe({
        body: { fileId: presigned.fileId },
      });
      if (tErr || !transcript) throw new Error('Transcription failed');
      return { transcript: (transcript as { transcript: string }).transcript };
    },
  });
}
