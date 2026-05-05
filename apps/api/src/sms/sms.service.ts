import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsResult {
  id: string | null;
  sent: boolean;
  provider: 'semaphore' | 'twilio' | 'noop';
}

type Provider = 'semaphore' | 'twilio' | 'noop';

/**
 * Thin wrapper around an SMS gateway. Two providers wired:
 *   - Semaphore (semaphore.co) — Philippines-first, single key, cheapest path
 *     for PH numbers. Set SMS_PROVIDER=semaphore + SEMAPHORE_API_KEY.
 *   - Twilio — international fallback. Set SMS_PROVIDER=twilio + TWILIO_*.
 *
 * Never throws. SMS delivery is not allowed to break the calling business
 * action (same contract as MailerService).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: Provider;
  private readonly senderName: string;

  constructor(private readonly config: ConfigService) {
    const requested = (this.config.get<string>('SMS_PROVIDER') ?? '').toLowerCase();
    this.senderName = this.config.get<string>('SMS_SENDER_NAME') ?? 'CLINIQ';

    if (requested === 'semaphore' && this.config.get<string>('SEMAPHORE_API_KEY')) {
      this.provider = 'semaphore';
    } else if (
      requested === 'twilio' &&
      this.config.get<string>('TWILIO_ACCOUNT_SID') &&
      this.config.get<string>('TWILIO_AUTH_TOKEN') &&
      this.config.get<string>('TWILIO_FROM')
    ) {
      this.provider = 'twilio';
    } else {
      this.provider = 'noop';
    }
  }

  isEnabled(): boolean {
    return this.provider !== 'noop';
  }

  async send(msg: SmsMessage): Promise<SmsResult> {
    const to = normalizePhone(msg.to);
    if (!to) {
      this.logger.warn(`[sms] dropping invalid recipient "${msg.to}"`);
      return { id: null, sent: false, provider: this.provider };
    }
    if (this.provider === 'noop') {
      this.logger.log(
        `[sms:noop] would send to=${maskPhone(to)} body="${truncate(msg.body, 60)}"`,
      );
      return { id: null, sent: false, provider: 'noop' };
    }
    try {
      if (this.provider === 'semaphore') return await this.sendSemaphore(to, msg.body);
      return await this.sendTwilio(to, msg.body);
    } catch (err) {
      this.logger.error(`sms send failed: ${(err as Error).message}`);
      return { id: null, sent: false, provider: this.provider };
    }
  }

  private async sendSemaphore(to: string, body: string): Promise<SmsResult> {
    const key = this.config.get<string>('SEMAPHORE_API_KEY');
    const res = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        apikey: key ?? '',
        number: to,
        message: body,
        sendername: this.senderName,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`semaphore ${res.status} ${truncate(text, 200)}`);
    }
    const json = (await res.json()) as Array<{ message_id?: number | string }>;
    const id = json[0]?.message_id != null ? String(json[0].message_id) : null;
    return { id, sent: true, provider: 'semaphore' };
  }

  private async sendTwilio(to: string, body: string): Promise<SmsResult> {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID') ?? '';
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN') ?? '';
    const from = this.config.get<string>('TWILIO_FROM') ?? '';
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`twilio ${res.status} ${truncate(text, 200)}`);
    }
    const json = (await res.json()) as { sid?: string };
    return { id: json.sid ?? null, sent: true, provider: 'twilio' };
  }
}

/** PH-friendly phone normalization to E.164. Returns null if not parseable. */
function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('63') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('09') && digits.length === 11) return `+63${digits.slice(1)}`;
  if (input.trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
  return null;
}

function maskPhone(p: string): string {
  return p.length <= 6 ? p : `${p.slice(0, 4)}****${p.slice(-2)}`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
