import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '@org/db';

/**
 * Outbound webhook dispatcher. Reads `tenant.settings.appointmentWebhookUrl`
 * and POSTs lifecycle events. Pragmatic substitute for full Google/Microsoft
 * OAuth integration: clinics wire the URL into Zapier/Make/n8n which bridges
 * to whichever calendar they use. Signed via HMAC with JWT_SECRET so the
 * receiver can verify origin without per-tenant credentials.
 *
 * Never throws — webhook delivery is not allowed to break the calling
 * business action (same contract as Mailer/Sms/Notifications).
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly timeoutMs = 5_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async fire(
    tenantId: string,
    event:
      | 'appointment.created'
      | 'appointment.checked_in'
      | 'appointment.cancelled',
    payload: Record<string, unknown>,
  ): Promise<void> {
    let url: string | undefined;
    try {
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { settings: true },
      });
      const settings = tenant?.settings as
        | { appointmentWebhookUrl?: string }
        | null;
      url = settings?.appointmentWebhookUrl;
    } catch (err) {
      this.logger.warn(`webhook lookup failed: ${(err as Error).message}`);
      return;
    }
    if (!url) return;
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      this.logger.warn(`webhook url for tenant ${tenantId} is not http(s)`);
      return;
    }

    const body = JSON.stringify({
      event,
      tenantId,
      sentAt: new Date().toISOString(),
      data: payload,
    });
    const signature = this.sign(body);

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cliniq-event': event,
          'x-cliniq-signature': signature,
          'user-agent': 'ClinIQ-Webhooks/1.0',
        },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        this.logger.warn(`webhook ${event} → ${url}: ${res.status}`);
      } else {
        this.logger.log(`webhook ${event} → ${maskUrl(url)} (${res.status})`);
      }
    } catch (err) {
      // Includes AbortError when the receiver is slow.
      this.logger.warn(`webhook ${event} failed: ${(err as Error).message}`);
    }
  }

  /**
   * `sha256=<hex>` over the JSON body. Receivers verify with the same key
   * (we expose the JWT_SECRET as the shared secret for v1 — when we add a
   * per-tenant rotation knob, replace this with `tenant.settings.webhookSecret`).
   */
  private sign(body: string): string {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  }
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/[^/]*$/, '/…')}`;
  } catch {
    return '<invalid url>';
  }
}
