import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

const ISSUER = 'cliniq:cal';
const TOKEN_VERSION = 'v1';

@Injectable()
export class CalendarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Stateless feed token. HMAC over `(version|tenantId|providerId)` keyed with
   * JWT_SECRET. No DB column needed; revoke by rotating JWT_SECRET (nuclear)
   * or, in v2, prefix with a per-tenant nonce we can rotate independently.
   */
  signFeedToken(tenantId: string, providerId: string): string {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const payload = `${TOKEN_VERSION}|${ISSUER}|${tenantId}|${providerId}`;
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    return `${TOKEN_VERSION}.${sig}`;
  }

  private verifyFeedToken(tenantId: string, providerId: string, token: string): boolean {
    const expected = this.signFeedToken(tenantId, providerId);
    if (expected.length !== token.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
    } catch {
      return false;
    }
  }

  /**
   * Caller (logged-in provider/admin) requests the feed URL for a given provider.
   * Returns the signed token; caller is responsible for assembling the full URL.
   */
  async issueFeedToken(targetProviderId: string, user: AuthenticatedUser) {
    // OWNER/ADMIN can issue for anyone in their tenant; everyone else can
    // only issue for themselves.
    if (
      user.role !== 'OWNER' &&
      user.role !== 'ADMIN' &&
      targetProviderId !== user.userId
    ) {
      throw new UnauthorizedException('cannot issue feed for another provider');
    }
    const provider = await this.prisma.user.findFirst({
      where: {
        id: targetProviderId,
        tenants: { some: { tenantId: user.tenantId, status: 'ACTIVE' } },
      },
      select: { id: true, name: true, email: true },
    });
    if (!provider) throw new NotFoundException('provider not in this tenant');
    return {
      providerId: provider.id,
      providerName: provider.name,
      token: this.signFeedToken(user.tenantId, provider.id),
    };
  }

  /**
   * Public ICS feed. Verifies token, then dumps the provider's appointments
   * over the next ±90 days. Lookup uses raw queries — RLS isn't enabled on
   * this path because there's no JWT. Token holds tenant scope.
   */
  async renderIcs(tenantId: string, providerId: string, token: string): Promise<string> {
    if (!this.verifyFeedToken(tenantId, providerId, token)) {
      throw new UnauthorizedException('invalid calendar token');
    }
    const horizonStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const horizonEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        providerId,
        deletedAt: null,
        startsAt: { gte: horizonStart, lte: horizonEnd },
      },
      include: {
        patient: { select: { firstName: true, lastName: true, mrn: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });

    return buildIcs({
      tenantId,
      providerId,
      events: appointments.map((a) => ({
        uid: `${a.id}@cliniq`,
        summary: `${a.patient.lastName}, ${a.patient.firstName} (${a.patient.mrn})`,
        description:
          `${a.type}${a.reason ? ` · ${a.reason}` : ''}${a.notes ? `\\n${a.notes}` : ''}`,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED',
      })),
    });
  }
}

interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  status: 'CONFIRMED' | 'CANCELLED';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** RFC 5545 UTC timestamp: YYYYMMDDTHHMMSSZ */
function fmt(d: Date): string {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/** Escape per RFC 5545 §3.3.11. */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function buildIcs(input: { tenantId: string; providerId: string; events: IcsEvent[] }): string {
  const now = fmt(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClinIQ//Provider Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:ClinIQ provider ${input.providerId.slice(0, 8)}`,
    'X-PUBLISHED-TTL:PT15M',
  ];
  for (const e of input.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${esc(e.uid)}`,
      `DTSTAMP:${now}`,
      `DTSTART:${fmt(e.startsAt)}`,
      `DTEND:${fmt(e.endsAt)}`,
      `SUMMARY:${esc(e.summary)}`,
      `DESCRIPTION:${esc(e.description)}`,
      `STATUS:${e.status}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  // RFC 5545 mandates CRLF line endings.
  return lines.join('\r\n') + '\r\n';
}
