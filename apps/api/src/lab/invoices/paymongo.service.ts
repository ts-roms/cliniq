import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Thin wrapper around the PayMongo "Links" API + webhook signature
 * verification. Two configuration knobs:
 *
 *   PAYMONGO_SECRET_KEY    — `sk_test_…` / `sk_live_…`. Without it, the
 *                             service goes into no-op mode and the lab
 *                             module falls back to MANUAL payment links.
 *   PAYMONGO_WEBHOOK_SECRET — used to verify incoming webhook signatures.
 *
 * Docs: https://developers.paymongo.com/reference/the-links-object
 */
@Injectable()
export class PaymongoService {
  private readonly logger = new Logger(PaymongoService.name);
  private readonly secretKey: string | null;
  private readonly webhookSecret: string | null;
  private readonly baseUrl = 'https://api.paymongo.com/v1';

  constructor(private readonly config: ConfigService) {
    this.secretKey = config.get<string>('PAYMONGO_SECRET_KEY') ?? null;
    this.webhookSecret = config.get<string>('PAYMONGO_WEBHOOK_SECRET') ?? null;
  }

  get isConfigured(): boolean {
    return this.secretKey !== null;
  }

  /**
   * Create a PayMongo Link. PayMongo expects `amount` in centavos (PHP
   * minor units) and a `description` ≤120 chars. Returns the link's id +
   * the public checkout URL the payer follows.
   */
  async createLink(input: {
    amountCents: number;
    description: string;
    remarks?: string;
  }): Promise<{ id: string; checkoutUrl: string; rawStatus: string }> {
    if (!this.secretKey) {
      throw new Error(
        'PayMongo not configured — set PAYMONGO_SECRET_KEY to enable hosted checkout.',
      );
    }
    const res = await fetch(`${this.baseUrl}/links`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: input.amountCents,
            description: input.description.slice(0, 120),
            remarks: input.remarks?.slice(0, 120),
          },
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `PayMongo create-link failed: ${res.status} ${text.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as {
      data: {
        id: string;
        attributes: { checkout_url: string; status: string };
      };
    };
    return {
      id: json.data.id,
      checkoutUrl: json.data.attributes.checkout_url,
      rawStatus: json.data.attributes.status,
    };
  }

  /**
   * Verify a PayMongo webhook signature. Header format:
   *   `t=<timestamp>,te=<test_sig>,li=<live_sig>`
   * The signed payload is `<timestamp>.<raw_body>`. We accept either the
   * `te` or `li` signature depending on which secret is configured.
   *
   * Returns true on success. Returns false (and logs) on any mismatch —
   * never throws, so the webhook controller can return 401 cleanly.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        'PAYMONGO_WEBHOOK_SECRET unset — webhook signature check disabled',
      );
      // Failing closed in prod is the right call. The controller checks
      // isConfigured() before processing payloads, so this branch only
      // runs in dev where we want easy testing.
      return false;
    }
    if (!signatureHeader) return false;
    const parts = Object.fromEntries(
      signatureHeader
        .split(',')
        .map((p) => p.trim().split('='))
        .filter((p): p is [string, string] => p.length === 2),
    );
    const ts = parts['t'];
    const candidate = parts['te'] ?? parts['li'];
    if (!ts || !candidate) return false;
    const payload = `${ts}.${rawBody}`;
    const expected = createHmac('sha256', this.webhookSecret).update(payload).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }
}

/**
 * Subset of the PayMongo webhook event payload that we care about. The full
 * shape is much richer; this captures just the fields we read.
 */
export interface PaymongoWebhookEvent {
  data: {
    id: string;
    attributes: {
      type: string; // e.g. "link.payment.paid"
      data: {
        id: string;
        type: string; // "link" | "payment" | …
        attributes: {
          status?: string;
          amount?: number;
          payments?: Array<{
            id: string;
            attributes: { amount: number; status: string };
          }>;
        };
      };
    };
  };
}
