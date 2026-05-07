import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@org/db';
import { MailerService } from '../../mailer/mailer.service.js';

interface OwnerContact {
  email: string;
  name: string | null;
}

/**
 * Shared mail dispatch + cross-tenant owner-email lookup. Both lab and
 * clinic notifications go through here so:
 *   - we only have one place that uses `withPlatformContext` to read
 *     other-tenant user lists, and
 *   - all "fire and forget; never throw" semantics live in one wrapper.
 *
 * The mailer is itself a no-op when `RESEND_API_KEY` is unset, so this
 * works in dev without real mail sending.
 */
@Injectable()
export class LabNotificationsService {
  private readonly logger = new Logger(LabNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Look up the OWNER user's email for a tenant. Uses platform context
   * because the *requesting* tenant cannot read the other side's user
   * list under normal RLS.
   */
  async lookupOwnerEmail(tenantId: string): Promise<OwnerContact | null> {
    const owner = await this.prisma.withPlatformContext((tx) =>
      tx.tenantUser.findFirst({
        where: { tenantId, role: 'OWNER', status: 'ACTIVE' },
        include: { user: { select: { email: true, name: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
    );
    if (!owner?.user?.email) return null;
    return { email: owner.user.email, name: owner.user.name };
  }

  /** Send an email and swallow errors (notification == best-effort). */
  async send(message: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    try {
      await this.mailer.send(message);
    } catch (err) {
      this.logger.warn(
        `mail send failed (${message.subject}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Fire-and-forget helper that wraps both the lookup and send. Pass the
   * tenant whose owner we want to notify and a callback that builds the
   * message given the owner's name. Returns nothing — caller awaits at
   * its own discretion.
   */
  async notifyOwner(
    tenantId: string,
    builder: (recipient: OwnerContact) => { subject: string; text: string },
  ): Promise<void> {
    const recipient = await this.lookupOwnerEmail(tenantId);
    if (!recipient) return;
    const msg = builder(recipient);
    await this.send({ to: recipient.email, ...msg });
  }

  webUrl(path: string): string {
    const base = this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
    return `${base.replace(/\/+$/u, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
