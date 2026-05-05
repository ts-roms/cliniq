import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Thin wrapper around Resend. No-op (logs only) when RESEND_API_KEY is unset
 * — keeps dev + CI environments from sending real mail. Never throws — mail
 * delivery is not allowed to break the calling business action.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly client: Resend | null;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    this.from = this.config.get<string>('MAIL_FROM') ?? 'ClinIQ <noreply@cliniq.app>';
    this.enabled = !!key;
    this.client = this.enabled ? new Resend(key) : null;
  }

  async send(msg: MailMessage): Promise<{ id: string | null; sent: boolean }> {
    if (!this.enabled || !this.client) {
      this.logger.log(
        `[mailer:noop] would send to=${[...[msg.to]].flat().join(',')} subject="${msg.subject}"`,
      );
      return { id: null, sent: false };
    }
    try {
      const { data } = await this.client.emails.send({
        from: this.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html ?? undefined,
      });
      return { id: data?.id ?? null, sent: true };
    } catch (err) {
      this.logger.error(`mail send failed (${msg.subject}): ${(err as Error).message}`);
      return { id: null, sent: false };
    }
  }
}
