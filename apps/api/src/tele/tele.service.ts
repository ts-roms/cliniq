import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import {
  PrismaService,
  TeleRole,
  type TeleSignalKind,
  TeleSessionStatus,
  type PrismaClient,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { CreateSessionDto } from './dto/tele.dto.js';

export interface SessionView {
  id: string;
  status: TeleSessionStatus;
  patientId: string;
  providerId: string;
  appointmentId: string | null;
  consultationId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface ProviderSessionResponse extends SessionView {
  joinToken: string;
  joinUrl: string;
}

export interface PatientJoinResponse extends SessionView {
  patientToken: string;
  patient: { firstName: string; lastName: string };
  provider: { name: string | null };
}

const TOKEN_BYTES = 24;

@Injectable()
export class TeleService {
  private readonly logger = new Logger(TeleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Session lifecycle ────────────────────────────

  async create(dto: CreateSessionDto, user: AuthenticatedUser): Promise<ProviderSessionResponse> {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, deletedAt: null },
      });
      if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);
      if (dto.appointmentId) {
        const appt = await tx.appointment.findFirst({
          where: { id: dto.appointmentId, patientId: dto.patientId, deletedAt: null },
        });
        if (!appt) {
          throw new BadRequestException('appointment not found or not linked to this patient');
        }
      }

      const joinToken = randomBytes(TOKEN_BYTES).toString('base64url');
      const patientToken = randomBytes(TOKEN_BYTES).toString('base64url');
      const session = await tx.teleSession.create({
        data: {
          tenantId: user.tenantId,
          patientId: dto.patientId,
          providerId: user.userId,
          appointmentId: dto.appointmentId ?? null,
          consultationId: dto.consultationId ?? null,
          joinToken,
          patientToken,
        },
      });

      this.logger.log(`tele session ${session.id} created by ${user.userId}`);
      return this.toProviderResponse(session);
    });
  }

  async getByIdForProvider(id: string, user: AuthenticatedUser): Promise<ProviderSessionResponse> {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const session = await tx.teleSession.findFirst({ where: { id } });
      if (!session) throw new NotFoundException(`Session ${id} not found`);
      if (session.providerId !== user.userId) {
        throw new ForbiddenException('not your session');
      }
      return this.toProviderResponse(session);
    });
  }

  async end(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const session = await tx.teleSession.findFirst({ where: { id } });
      if (!session) throw new NotFoundException(`Session ${id} not found`);
      if (session.providerId !== user.userId) {
        throw new ForbiddenException('not your session');
      }
      if (session.status === TeleSessionStatus.ENDED) return session;
      return tx.teleSession.update({
        where: { id },
        data: { status: TeleSessionStatus.ENDED, endedAt: new Date() },
      });
    });
  }

  /**
   * Patient grants/declines recording consent. Called from the patient room
   * after the doctor sends a CONSENT_REQUEST signal. Stamps the consent
   * ledger so audit can prove who agreed and when. Token-authenticated, not
   * JWT — patient may not have a portal account.
   */
  async setRecordingConsent(
    sessionId: string,
    granted: boolean,
    patientToken: string,
  ) {
    const session = await this.prisma.teleSession.findFirst({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.patientToken !== patientToken) {
      throw new UnauthorizedException('invalid patient token');
    }
    return this.prisma.teleSession.update({
      where: { id: sessionId },
      data: granted
        ? { recordingConsentAt: new Date(), recordingDeclinedAt: null }
        : { recordingDeclinedAt: new Date(), recordingConsentAt: null },
    });
  }

  // ── Patient join (token-based, no JWT) ───────────

  async join(joinToken: string): Promise<PatientJoinResponse> {
    // Patient join bypasses RLS — we look up by joinToken globally and trust
    // the (tenantId, joinToken) unique index. Token has 24 bytes of entropy
    // so it's not guessable. RLS-bound queries below use the tenant context.
    const session = await this.prisma.teleSession.findFirst({
      where: { joinToken },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
    });
    if (!session) throw new UnauthorizedException('invalid join token');
    if (session.status === TeleSessionStatus.ENDED || session.status === TeleSessionStatus.CANCELLED) {
      throw new ForbiddenException('session is closed');
    }
    const provider = await this.prisma.user.findFirst({
      where: { id: session.providerId },
      select: { name: true },
    });
    // First join transitions PENDING → ACTIVE.
    if (session.status === TeleSessionStatus.PENDING) {
      await this.prisma.teleSession.update({
        where: { id: session.id },
        data: { status: TeleSessionStatus.ACTIVE, startedAt: new Date() },
      });
    }
    return {
      id: session.id,
      status: TeleSessionStatus.ACTIVE,
      patientId: session.patientId,
      providerId: session.providerId,
      appointmentId: session.appointmentId,
      consultationId: session.consultationId,
      startedAt: session.startedAt ?? new Date(),
      endedAt: session.endedAt,
      patientToken: session.patientToken,
      patient: { firstName: session.patient.firstName, lastName: session.patient.lastName },
      provider: { name: provider?.name ?? null },
    };
  }

  // ── Signaling ────────────────────────────────────

  async listSignals(
    sessionId: string,
    since: number,
    auth: { kind: 'provider'; user: AuthenticatedUser } | { kind: 'patient'; token: string },
  ) {
    const session = await this.requireAuthorizedSession(sessionId, auth);
    return this.prisma.teleSignal.findMany({
      where: { sessionId: session.id, seq: { gt: since } },
      orderBy: { seq: 'asc' },
      take: 200,
    });
  }

  async postSignal(
    sessionId: string,
    kind: TeleSignalKind,
    payload: Record<string, unknown>,
    auth: { kind: 'provider'; user: AuthenticatedUser } | { kind: 'patient'; token: string },
  ) {
    const session = await this.requireAuthorizedSession(sessionId, auth);
    if (session.status === TeleSessionStatus.ENDED) {
      throw new ForbiddenException('session ended');
    }
    const fromRole = auth.kind === 'provider' ? TeleRole.DOCTOR : TeleRole.PATIENT;
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.teleSignal.findFirst({
        where: { sessionId: session.id },
        orderBy: { seq: 'desc' },
      });
      const seq = (last?.seq ?? 0) + 1;
      return this.bareCreate(tx, session.tenantId, session.id, seq, fromRole, kind, payload);
    });
  }

  // ── TURN config ──────────────────────────────────

  /**
   * Returns ICE servers for the browser RTCPeerConnection. STUN is always on
   * (Google public STUN). TURN is configured via env (set TURN_URLS,
   * TURN_USERNAME, TURN_CREDENTIAL). Without TURN configured, calls behind
   * symmetric NAT will fail — fine for office-LAN demos, not for production.
   */
  iceConfig() {
    const turnUrls = (this.config.get<string>('TURN_URLS') ?? '').trim();
    const username = this.config.get<string>('TURN_USERNAME');
    const credential = this.config.get<string>('TURN_CREDENTIAL');
    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
      { urls: 'stun:stun.l.google.com:19302' },
    ];
    if (turnUrls) {
      iceServers.push({
        urls: turnUrls.split(',').map((u) => u.trim()).filter(Boolean),
        ...(username ? { username } : {}),
        ...(credential ? { credential } : {}),
      });
    }
    return { iceServers };
  }

  // ── helpers ──────────────────────────────────────

  private async requireAuthorizedSession(
    sessionId: string,
    auth: { kind: 'provider'; user: AuthenticatedUser } | { kind: 'patient'; token: string },
  ) {
    const session = await this.prisma.teleSession.findFirst({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (auth.kind === 'provider') {
      if (session.tenantId !== auth.user.tenantId) {
        throw new ForbiddenException('cross-tenant access denied');
      }
      if (session.providerId !== auth.user.userId) {
        throw new ForbiddenException('not your session');
      }
    } else {
      if (session.patientToken !== auth.token) {
        throw new UnauthorizedException('invalid patient token');
      }
    }
    return session;
  }

  private async bareCreate(
    tx: PrismaClient,
    tenantId: string,
    sessionId: string,
    seq: number,
    fromRole: TeleRole,
    kind: TeleSignalKind,
    payload: Record<string, unknown>,
  ) {
    return tx.teleSignal.create({
      data: { tenantId, sessionId, seq, fromRole, kind, payload },
    });
  }

  private toProviderResponse(session: {
    id: string;
    status: TeleSessionStatus;
    patientId: string;
    providerId: string;
    appointmentId: string | null;
    consultationId: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    joinToken: string;
  }): ProviderSessionResponse {
    const base = this.config.get<string>('PORTAL_BASE_URL') ?? '';
    return {
      id: session.id,
      status: session.status,
      patientId: session.patientId,
      providerId: session.providerId,
      appointmentId: session.appointmentId,
      consultationId: session.consultationId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      joinToken: session.joinToken,
      joinUrl: `${base}/portal/tele/${session.joinToken}`,
    };
  }
}
