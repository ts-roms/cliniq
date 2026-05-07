import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SoapDraftResponse {
  draft: Record<string, unknown>;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  latencyMs: number;
}

interface SoapDraftRequest {
  consultationId: string;
  transcript: string;
  patientContext: Record<string, unknown>;
}

/**
 * Thin client for the internal `ai-service`. The ai-service is in the same
 * VPC in production — we trust its hostname but still defend with a timeout
 * and one retry on network errors.
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('AI_SERVICE_URL') ?? 'http://localhost:4100';
    this.timeoutMs = Number(this.config.get<string>('AI_SERVICE_TIMEOUT_MS') ?? 15_000);
  }

  async draftSoap(req: SoapDraftRequest): Promise<SoapDraftResponse> {
    return this.requestJson<SoapDraftResponse>('/ai/drafts/soap', req);
  }

  async transcribe(req: {
    s3Bucket: string;
    s3Key: string;
    mimeType: string;
  }): Promise<{ transcript: string; provider: string; durationSec?: number }> {
    return this.requestJson('/ai/transcribe', req);
  }

  async draftLabTreatmentPlan(req: {
    case: {
      refNumber: number | null;
      productName: string;
      urgency: 'STANDARD' | 'URGENT';
      patientLabel: string | null;
      doctorLabel: string | null;
      notes: string | null;
      formData: Record<string, unknown> | null;
    };
    materialsUsed?: Array<{ material: string; lot: string }>;
  }): Promise<{
    summary: string;
    promptVersion: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    latencyMs: number;
  }> {
    return this.requestJson('/lab-drafts/treatment-plan', req);
  }

  async dermatologyDraft(req: {
    consultationId: string;
    imageS3Keys: string[];
    s3Bucket?: string;
    patientContext: {
      age?: number;
      sex?: string;
      allergies?: string[];
      presentingComplaint?: string;
    };
  }): Promise<{
    draft: Record<string, unknown>;
    promptVersion: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    latencyMs: number;
    imageCount: number;
  }> {
    return this.requestJson('/ai/dermatology/draft', req);
  }

  private async requestJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const attempts = 2;
    let lastErr: unknown;

    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new BadGatewayException(
            `ai-service ${path} responded ${res.status}: ${text.slice(0, 200)}`,
          );
        }
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err;
        if (err instanceof BadGatewayException) throw err; // don't retry HTTP errors
        this.logger.warn(`ai-service ${path} attempt ${i + 1} failed: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ServiceUnavailableException(
      `ai-service unreachable after ${attempts} attempts: ${(lastErr as Error)?.message}`,
    );
  }
}
