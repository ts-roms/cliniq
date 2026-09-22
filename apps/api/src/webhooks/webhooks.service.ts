import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '@org/db';
import { Features, planHasFeature, type Plan } from '@org/shared-types';
import { checkWebhookTarget } from './webhook-target.js';

/** Appointment lifecycle events the dispatcher fans out. */
export type WebhookEvent =
  | 'appointment.created'
  | 'appointment.checked_in'
  | 'appointment.started'
  | 'appointment.completed'
  | 'appointment.cancelled'
  | 'appointment.no_show'
  | 'appointment.rescheduled';

/**
 * Outbound webhook dispatcher. Reads `tenant.settings.appointmentWebhookUrl`
 * and POSTs lifecycle events. Pragmatic substitute for full Google/Microsoft
 * OAuth integration: clinics wire the URL into Zapier/Make/n8n which bridges
 * to whichever calendar they use. Signed via HMAC with JWT_SECRET so the
 * receiver can verify origin without per-tenant credentials.
 *
 * Two things are checked before anything leaves the process:
 *   1. the tenant's plan actually includes WEBHOOKS (it is PREMIUM-only, and
 *      no route gates it — the URL is just a settings field any plan can write);
 *   2. the target is a public https endpoint (see webhook-target.ts) — the URL
 *      is tenant-controlled, so without this it is a straight SSRF into the
 *      private network / cloud metadata service.
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

  /**
   * Fire-and-forget entry point. Callers invoke this as `void fire(...)`, so
   * ANY rejection escaping here is an unhandled rejection — which takes the
   * process down. The whole dispatch is therefore wrapped: the "never throws"
   * contract is structural, not something each new line has to remember.
   */
  async fire(
    tenantId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.dispatch(tenantId, event, payload);
    } catch (err) {
      this.logger.warn(`webhook ${event} aborted: ${(err as Error).message}`);
    }
  }

  private async dispatch(
    tenantId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // PREMIUM-only. No route carries @RequiresFeature(WEBHOOKS) because the
    // subscription is a settings field rather than an endpoint, so the plan
    // check has to happen at dispatch time.
    const ctx = await this.prisma.getTenantContext(tenantId);
    if (!ctx || ctx.kind === 'LAB') return;
    if (!planHasFeature(ctx.plan as Plan, Features.WEBHOOKS)) return;

    let url: string | undefined;
    try {
      // RLS: needs withTenant or the bare client read returns null and the
      // webhook is silently skipped.
      const tenant = await this.prisma.withTenant(tenantId, null, (tx) =>
        tx.tenant.findFirst({
          where: { id: tenantId, deletedAt: null },
          select: { settings: true },
        }),
      );
      const settings = tenant?.settings as {
        appointmentWebhookUrl?: string;
      } | null;
      url = settings?.appointmentWebhookUrl;
    } catch (err) {
      this.logger.warn(`webhook lookup failed: ${(err as Error).message}`);
      return;
    }
    if (!url) return;

    const verdict = await checkWebhookTarget(url, {
      allowInsecure:
        this.config.get<string>('WEBHOOKS_ALLOW_INSECURE') === 'true',
      allowPrivate:
        this.config.get<string>('WEBHOOKS_ALLOW_PRIVATE_HOSTS') === 'true',
    });
    if (!verdict.ok) {
      this.logger.warn(
        `webhook url for tenant ${tenantId} refused: ${verdict.reason}`,
      );
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
        // A 302 to http://169.254.169.254 would walk straight past the
        // pre-flight target check, so redirects are surfaced, not followed.
        redirect: 'manual',
      });
      clearTimeout(t);
      if (res.status >= 300 && res.status < 400) {
        this.logger.warn(
          `webhook ${event} → ${maskUrl(url)}: ${res.status} (redirects are not followed)`,
        );
      } else if (!res.ok) {
        this.logger.warn(`webhook ${event} → ${maskUrl(url)}: ${res.status}`);
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
