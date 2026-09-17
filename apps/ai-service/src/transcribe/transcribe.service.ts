import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
  type LanguageCode,
} from '@aws-sdk/client-transcribe';
import { randomUUID } from 'node:crypto';

export interface TranscribeRequest {
  s3Bucket: string;
  s3Key: string;
  mimeType: string;
}

export interface TranscribeResult {
  transcript: string;
  provider: string;
  durationSec?: number;
}

/**
 * Speech-to-text via AWS Transcribe (batch). The api uploads the audio to
 * the PHI bucket and hands us the S3 reference; we kick off a transcription
 * job, poll until it's COMPLETED or FAILED, then fetch the result. Cap the
 * poll loop at `TRANSCRIBE_MAX_WAIT_MS` so the request never hangs forever
 * — short consult clips (≤2 min) finish in ~10s, so the default 90s is
 * comfortable headroom for the synchronous flow.
 *
 * NOT a long-term solution. Anything beyond 2-3 min of audio should move to
 * AWS Transcribe Streaming over a WebSocket so the doctor sees text appear
 * as they speak. This is a P0 stop-gap so prod stops returning canned text.
 *
 * Stub fallback fires when `AWS_TRANSCRIBE_ENABLED !== 'true'` OR the AWS
 * region is unset — keeps `docker compose up` working out of the box.
 */
@Injectable()
export class TranscribeService {
  private readonly logger = new Logger(TranscribeService.name);
  private readonly client: TranscribeClient | null;
  private readonly enabled: boolean;
  private readonly languageCode: LanguageCode;
  private readonly maxWaitMs: number;
  private readonly pollIntervalMs: number;
  private readonly outputBucket: string | null;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION');
    this.enabled =
      this.config.get<string>('AWS_TRANSCRIBE_ENABLED') === 'true' &&
      typeof region === 'string' &&
      region.length > 0;
    this.client = this.enabled ? new TranscribeClient({ region }) : null;
    this.languageCode =
      (this.config.get<string>('AWS_TRANSCRIBE_LANGUAGE') as LanguageCode) ??
      ('en-US' as LanguageCode);
    this.maxWaitMs = Number(this.config.get<string>('TRANSCRIBE_MAX_WAIT_MS') ?? 90_000);
    this.pollIntervalMs = Number(
      this.config.get<string>('TRANSCRIBE_POLL_INTERVAL_MS') ?? 1_500,
    );
    this.outputBucket = this.config.get<string>('S3_BUCKET_PHI') ?? null;
    if (!this.enabled) {
      this.logger.warn(
        'AWS Transcribe disabled (AWS_TRANSCRIBE_ENABLED!=true or AWS_REGION unset). ' +
          'Falling back to stub transcripts. NOT acceptable in production.',
      );
    }
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    if (!this.enabled || !this.client) return this.stub(req);

    const jobName = `cliniq-${randomUUID()}`;
    const mediaUri = `s3://${req.s3Bucket}/${req.s3Key}`;
    const mediaFormat = this.formatFor(req.mimeType, req.s3Key);

    this.logger.log(
      `Starting Transcribe job ${jobName} for ${mediaUri} format=${mediaFormat} lang=${this.languageCode}`,
    );

    await this.client.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        Media: { MediaFileUri: mediaUri },
        MediaFormat: mediaFormat,
        LanguageCode: this.languageCode,
        // Write the JSON result back into the PHI bucket so the job output
        // lives under the same KMS policy as the source audio.
        OutputBucketName: this.outputBucket ?? req.s3Bucket,
        OutputKey: `transcripts/${jobName}.json`,
      }),
    );

    const started = Date.now();
    while (Date.now() - started < this.maxWaitMs) {
      await sleep(this.pollIntervalMs);
      const status = await this.client.send(
        new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
      );
      const job = status.TranscriptionJob;
      const state = job?.TranscriptionJobStatus;
      if (state === 'COMPLETED') {
        const uri = job?.Transcript?.TranscriptFileUri;
        if (!uri) {
          this.logger.error(`Transcribe ${jobName} COMPLETED but no TranscriptFileUri`);
          return this.stub(req, 'aws-transcribe-no-result');
        }
        const text = await this.fetchTranscriptText(uri);
        const durationSec =
          typeof job?.IdentifiedLanguageScore === 'number'
            ? undefined
            : computeDurationSec(job?.CompletionTime, job?.CreationTime);
        return {
          transcript: text,
          provider: 'aws-transcribe',
          durationSec,
        };
      }
      if (state === 'FAILED') {
        this.logger.error(
          `Transcribe ${jobName} FAILED: ${job?.FailureReason ?? 'unknown'}`,
        );
        return this.stub(req, 'aws-transcribe-failed');
      }
      // IN_PROGRESS / QUEUED → keep polling.
    }
    this.logger.warn(
      `Transcribe ${jobName} did not finish within ${this.maxWaitMs}ms; returning stub`,
    );
    return this.stub(req, 'aws-transcribe-timeout');
  }

  private async fetchTranscriptText(uri: string): Promise<string> {
    // AWS returns a pre-signed S3 URL. fetch() is fine here.
    const res = await fetch(uri);
    if (!res.ok) {
      this.logger.error(`Transcript file fetch returned ${res.status}`);
      return '';
    }
    const body = (await res.json()) as {
      results?: { transcripts?: Array<{ transcript?: string }> };
    };
    return body.results?.transcripts?.[0]?.transcript ?? '';
  }

  private formatFor(mimeType: string, key: string): string {
    // AWS Transcribe MediaFormat: 'mp3' | 'mp4' | 'wav' | 'flac' | 'ogg' |
    // 'amr' | 'webm' | 'm4a'. Derive from mime first, fall back to extension.
    const fromMime: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'mp4',
      'audio/x-m4a': 'm4a',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/wave': 'wav',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
    };
    const m = fromMime[mimeType.toLowerCase()];
    if (m) return m;
    const ext = key.toLowerCase().split('.').pop();
    return ['mp3', 'mp4', 'wav', 'flac', 'ogg', 'amr', 'webm', 'm4a'].includes(
      ext ?? '',
    )
      ? (ext as string)
      : 'mp3';
  }

  private stub(req: TranscribeRequest, reason = 'stub'): TranscribeResult {
    this.logger.log(`stub-transcribe s3://${req.s3Bucket}/${req.s3Key} (${req.mimeType}) reason=${reason}`);
    return {
      transcript:
        `[stub transcript for s3://${req.s3Bucket}/${req.s3Key}]. ` +
        'Replace with the doctor-narrated consult once Whisper / Transcribe is wired.',
      provider: reason,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDurationSec(
  completion: Date | string | undefined,
  creation: Date | string | undefined,
): number | undefined {
  if (!completion || !creation) return undefined;
  const end = typeof completion === 'string' ? Date.parse(completion) : completion.getTime();
  const start = typeof creation === 'string' ? Date.parse(creation) : creation.getTime();
  if (Number.isNaN(end) || Number.isNaN(start) || end <= start) return undefined;
  // Wall-clock job duration is NOT audio duration, but it's the only signal
  // AWS Transcribe gives us without parsing the result JSON. Good enough for
  // a cost estimate; replace with the audio duration once we move to a
  // provider that returns it.
  return Math.round((end - start) / 1000);
}
