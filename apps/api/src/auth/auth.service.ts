import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrismaService,
  Role as DbRole,
  MemberStatus,
  TenantStatus,
  type PrismaClient,
} from '@org/db';
import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  generateOpaqueToken,
  hashToken,
  parseDurationMs,
  JWT_AUDIENCES,
  type Role,
} from '@org/auth';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { RegisterPatientDto } from './dto/register-patient.dto.js';
import type { RefreshTokenDto } from './dto/refresh.dto.js';
import type {
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password-reset.dto.js';
import { MfaService } from '../mfa/mfa.service.js';
import { MailerService } from '../mailer/mailer.service.js';

/** Request metadata recorded on the RefreshSession row (forensics only). */
export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * The slice of a tenant row that rides inside the tokens. Callers that
 * already loaded the tenant (login / refresh / register) pass it through so
 * token issuance doesn't re-read it in a transaction of its own.
 */
const TENANT_SNAPSHOT = { kind: true, plan: true, labPlan: true } as const;
type TenantSnapshot = {
  kind: 'CLINIC' | 'LAB';
  plan: string | null;
  labPlan: string | null;
} | null;

/** Thrown inside the refresh write transaction to roll it back on a race. */
class RefreshRaceError extends Error {}

const DEFAULT_LOCKOUT_THRESHOLD = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;
const DEFAULT_RESET_TTL_MIN = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly lockoutThreshold: number;
  private readonly lockoutMinutes: number;
  private readonly resetTtlMin: number;
  /**
   * When true, forgot-password responses include the raw reset token so
   * e2e suites can complete the flow without an inbox. Loud opt-in; never
   * set it anywhere real mail is configured.
   */
  private readonly exposeDebugTokens: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
    private readonly mailer: MailerService,
  ) {
    this.lockoutThreshold = Number(
      this.config.get<string>('AUTH_LOCKOUT_THRESHOLD') ??
        DEFAULT_LOCKOUT_THRESHOLD,
    );
    this.lockoutMinutes = Number(
      this.config.get<string>('AUTH_LOCKOUT_MINUTES') ??
        DEFAULT_LOCKOUT_MINUTES,
    );
    this.resetTtlMin = Number(
      this.config.get<string>('AUTH_RESET_TTL_MIN') ?? DEFAULT_RESET_TTL_MIN,
    );
    this.exposeDebugTokens =
      this.config.get<string>('AUTH_EXPOSE_DEBUG_TOKENS') === 'true';
    if (this.exposeDebugTokens) {
      this.logger.warn(
        'AUTH_EXPOSE_DEBUG_TOKENS=true — password-reset tokens are returned in API responses. Test environments only.',
      );
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Registration — invite-only (plus the first-owner bootstrap path)
  // ────────────────────────────────────────────────────────────────

  /**
   * Create a User + TenantUser. Two ways in, both proven by a token:
   *
   *   1. `inviteToken` — issued by POST /members/invites. Email must match
   *      the invite, role comes from the invite.
   *   2. `bootstrapToken` — issued by POST /tenants when the tenant was
   *      created without an owner password. Only valid while the tenant has
   *      zero members; makes the caller OWNER.
   *
   * Knowing a tenant slug is deliberately NOT enough anymore — slugs are
   * public (subdomain + GET /tenants/:slug).
   */
  async register(dto: RegisterDto, meta: ClientMeta = {}) {
    if (!dto.inviteToken && !dto.bootstrapToken) {
      throw new ForbiddenException('an invite is required to join this clinic');
    }
    if (dto.inviteToken && dto.bootstrapToken) {
      throw new BadRequestException(
        'provide either inviteToken or bootstrapToken, not both',
      );
    }

    // Public route — runs without a tenant context. Wrap reads + writes
    // in `withPlatformContext` so the cliniq_app role can satisfy RLS
    // (the regular policies require `current_tenant_id()` to match,
    // which is null at signup time). All the pre-hash reads share ONE
    // transaction: each withPlatformContext call is an interactive
    // transaction (BEGIN / set_config / query / COMMIT) holding a pooled
    // connection, so one per query was the dominant cost of this route.
    const email = dto.email.toLowerCase();
    const { inviteToken, bootstrapToken } = dto;
    const read = await this.prisma.withPlatformContext(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { slug: dto.tenantSlug },
      });
      if (!tenant) return { tenant: null };
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      const invite = inviteToken
        ? await tx.tenantInvite.findUnique({
            where: { tokenHash: hashToken(inviteToken) },
          })
        : null;
      const memberCount = bootstrapToken
        ? await tx.tenantUser.count({ where: { tenantId: tenant.id } })
        : 0;
      return { tenant, existing, invite, memberCount };
    });
    const tenant = read.tenant;
    if (!tenant) throw new UnauthorizedException('invalid tenant');
    if (
      tenant.status === TenantStatus.SUSPENDED ||
      tenant.status === TenantStatus.CANCELLED
    ) {
      throw new UnauthorizedException('tenant inactive');
    }

    if (read.existing) {
      // A user who already has an account can't be created twice. Multi-
      // tenant membership (accept an invite while signed in elsewhere) is
      // a follow-up — see docs/audit-checklist.md.
      throw new ConflictException('email already registered — sign in instead');
    }

    // Resolve the role + the invite row (if any) BEFORE hashing so a bad
    // token fails fast without paying the bcrypt cost.
    let role: DbRole;
    let inviteId: string | null = null;
    if (inviteToken) {
      const invite = read.invite;
      if (
        !invite ||
        invite.tenantId !== tenant.id ||
        invite.acceptedAt ||
        invite.revokedAt ||
        invite.expiresAt < new Date()
      ) {
        throw new ForbiddenException('invite is invalid or has expired');
      }
      if (invite.email.toLowerCase() !== email) {
        throw new ForbiddenException(
          'invite was issued to a different email address',
        );
      }
      role = invite.role;
      inviteId = invite.id;
    } else if (bootstrapToken) {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      let payload;
      try {
        payload = await verifyJwt(bootstrapToken, {
          secret,
          audience: JWT_AUDIENCES.BOOTSTRAP,
        });
      } catch {
        throw new ForbiddenException(
          'bootstrap token is invalid or has expired',
        );
      }
      if (payload.tid !== tenant.id || payload.email?.toLowerCase() !== email) {
        throw new ForbiddenException(
          'bootstrap token does not match this signup',
        );
      }
      if (read.memberCount > 0) {
        throw new ForbiddenException('this clinic already has an owner');
      }
      role = DbRole.OWNER;
    } else {
      throw new ForbiddenException('an invite is required to join this clinic');
    }

    const passwordHash = await hashPassword(dto.password);

    const { user, issued } = await this.prisma.withPlatformContext(
      async (tx) => {
        const user = await tx.user.create({
          data: { email, name: dto.name, passwordHash },
        });
        const tenantUser = await tx.tenantUser.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            role,
            status: MemberStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });
        if (inviteId) {
          // Guard on acceptedAt=null so two concurrent accepts of the same
          // token can't both succeed — the second update matches 0 rows.
          const claimed = await tx.tenantInvite.updateMany({
            where: { id: inviteId, acceptedAt: null, revokedAt: null },
            data: { acceptedAt: new Date(), acceptedUserId: user.id },
          });
          if (claimed.count !== 1) {
            throw new ForbiddenException('invite has already been used');
          }
        }
        const issued = await this.issueTokensIn(
          tx,
          tenant,
          user.id,
          user.email,
          tenant.id,
          tenantUser.role as Role,
          undefined,
          meta,
        );
        return { user, issued };
      },
    );
    this.logger.log(
      `registered ${user.id} in tenant ${tenant.id} as ${role} via ${inviteId ? 'invite' : 'bootstrap'}`,
    );
    return issued.body;
  }

  // ────────────────────────────────────────────────────────────────
  // Login — with lockout
  // ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, meta: ClientMeta = {}) {
    const email = dto.email.toLowerCase();
    // Login runs before any tenant context exists. Reads on `users` and
    // `tenant_users` need RLS bypass since the regular policies hide
    // rows that don't match `current_tenant_id()`.
    // One read: user + active membership + the tenant snapshot the tokens
    // need. bcrypt runs OUTSIDE any transaction so the ~250ms of CPU per
    // login never holds a pooled connection.
    const user = await this.prisma.withPlatformContext((tx) =>
      tx.user.findUnique({
        where: { email },
        include: {
          tenants: {
            where: { status: MemberStatus.ACTIVE },
            take: 1,
            include: { tenant: { select: TENANT_SNAPSHOT } },
          },
        },
      }),
    );

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      // Same shape as a bad password so the client renders one message.
      // The lock itself is logged for ops; the caller only learns "try later".
      this.logger.warn(`login refused for locked account ${user.id}`);
      throw new UnauthorizedException(
        'too many failed attempts — try again later',
      );
    }

    if (
      !user ||
      user.deletedAt ||
      !(await verifyPassword(dto.password, user.passwordHash))
    ) {
      if (user && !user.deletedAt)
        await this.recordFailedLogin(user.id, user.failedLoginCount);
      throw new UnauthorizedException('invalid credentials');
    }
    const membership = user.tenants[0];
    if (!membership)
      throw new UnauthorizedException('user has no active tenant');

    // MFA gate: if the user has MFA enabled, require the second factor on
    // every login. Returns a structured 401 the client can use to render
    // the code prompt without a fresh password entry.
    if (user.mfaEnabled) {
      if (!dto.mfaCode) {
        throw new UnauthorizedException({
          message: 'mfa required',
          mfaRequired: true,
        });
      }
      const ok = await this.mfa.verifySecondFactor(user.id, dto.mfaCode);
      if (!ok) {
        // A wrong TOTP counts toward the lockout too — otherwise a leaked
        // password gives an attacker unlimited guesses at 6 digits.
        await this.recordFailedLogin(user.id, user.failedLoginCount);
        throw new UnauthorizedException({
          message: 'invalid mfa code',
          mfaRequired: true,
        });
      }
    }

    // One write: lastLogin (+ lockout reset) and the new refresh session.
    const { body } = await this.prisma.withPlatformContext(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data:
          user.failedLoginCount > 0 || user.lockedUntil
            ? { failedLoginCount: 0, lockedUntil: null, lastLogin: new Date() }
            : { lastLogin: new Date() },
      });
      return this.issueTokensIn(
        tx,
        membership.tenant,
        user.id,
        user.email,
        membership.tenantId,
        membership.role as Role,
        membership.patientId ?? undefined,
        meta,
      );
    });
    return body;
  }

  private async recordFailedLogin(userId: string, previousCount: number) {
    const count = previousCount + 1;
    const lock = count >= this.lockoutThreshold;
    await this.prisma.withPlatformContext((tx) =>
      tx.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: lock ? 0 : count,
          lockedUntil: lock
            ? new Date(Date.now() + this.lockoutMinutes * 60_000)
            : undefined,
        },
      }),
    );
    if (lock) {
      this.logger.warn(
        `account ${userId} locked for ${this.lockoutMinutes}m after ${count} failed attempts`,
      );
    }
  }

  /**
   * Patient self-registration for the portal. Creates Patient + User +
   * TenantUser(role=PATIENT, patientId=<linked>) atomically and issues a
   * patient-scoped JWT (carries `pid`).
   *
   * The portal flow is: clinic shares `tenantSlug` + `mrn` with the patient,
   * patient signs up with their own email/password matched against that mrn.
   * Email-on-file must match (defense in depth — prevents harvesting MRN
   * to claim another patient's record). If no email is on file, the clinic
   * must add one before the patient can self-register.
   */
  async registerPatient(dto: RegisterPatientDto, meta: ClientMeta = {}) {
    const tenant = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { slug: dto.tenantSlug } }),
    );
    if (!tenant) throw new UnauthorizedException('invalid tenant');
    if (
      tenant.status === TenantStatus.SUSPENDED ||
      tenant.status === TenantStatus.CANCELLED
    ) {
      throw new UnauthorizedException('tenant inactive');
    }

    const existingUser = await this.prisma.withPlatformContext((tx) =>
      tx.user.findUnique({ where: { email: dto.email } }),
    );
    if (existingUser) throw new ConflictException('email already registered');

    const passwordHash = await hashPassword(dto.password);

    const { user, tenantUser, patientId } =
      await this.prisma.withPlatformContext(async (tx) => {
        const patient = await tx.patient.findFirst({
          where: { tenantId: tenant.id, mrn: dto.mrn, deletedAt: null },
        });
        if (!patient) throw new UnauthorizedException('record not found');
        if (
          !patient.email ||
          patient.email.toLowerCase() !== dto.email.toLowerCase()
        ) {
          // Don't leak whether it's a missing email vs mismatch — same error.
          throw new UnauthorizedException('record could not be matched');
        }
        const alreadyLinked = await tx.tenantUser.findFirst({
          where: { tenantId: tenant.id, patientId: patient.id },
        });
        if (alreadyLinked)
          throw new ConflictException('record already has a portal account');

        const user = await tx.user.create({
          data: {
            email: dto.email,
            name: `${patient.firstName} ${patient.lastName}`,
            passwordHash,
          },
        });
        const tenantUser = await tx.tenantUser.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            patientId: patient.id,
            role: DbRole.PATIENT,
            status: MemberStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });
        return { user, tenantUser, patientId: patient.id };
      });

    const { body } = await this.issueTokens(
      user.id,
      user.email,
      tenant.id,
      tenantUser.role as Role,
      patientId,
      meta,
    );
    return body;
  }

  // ────────────────────────────────────────────────────────────────
  // Refresh — rotation with replay detection
  // ────────────────────────────────────────────────────────────────

  /**
   * Verify the refresh token (audience=cliniq-refresh), look up its
   * RefreshSession, rotate it, re-load the user's current tenant membership
   * (role may have changed since the token was issued) and issue a new pair.
   *
   * Replay: if the session was already rotated/revoked, someone is
   * presenting a token that was superseded — either the legitimate client
   * lost a race, or the token was stolen. We can't tell which, so we revoke
   * every session for that user+tenant and force a fresh login.
   *
   * Throws 401 on any failure — never leaks why.
   */
  async refresh(dto: RefreshTokenDto, meta: ClientMeta = {}) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    let payload;
    try {
      payload = await verifyJwt(dto.refreshToken, {
        secret,
        audience: JWT_AUDIENCES.TENANT_REFRESH,
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }

    // One read for the whole chain: session -> user -> membership in the
    // token's tenant -> tenant snapshot. The checks below run in the same
    // order as before; only the round-trips changed.
    const session = await this.prisma.withPlatformContext((tx) =>
      tx.refreshSession.findUnique({
        where: { tokenHash: hashToken(dto.refreshToken) },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              deletedAt: true,
              tenants: {
                where: {
                  tenantId: payload.tid,
                  status: MemberStatus.ACTIVE,
                },
                take: 1,
                select: {
                  role: true,
                  patientId: true,
                  tenantId: true,
                  tenant: { select: TENANT_SNAPSHOT },
                },
              },
            },
          },
        },
      }),
    );
    if (
      !session ||
      session.id !== payload.sid ||
      session.userId !== payload.sub
    ) {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (session.revokedAt) {
      // Rotated (replacedById set) = a token that was already exchanged is
      // being presented again — the classic stolen-token signature, so the
      // whole family goes. Revoked WITHOUT a successor (logout, suspension,
      // password reset) is just a stale client; refuse it and leave the
      // user's other devices alone.
      if (session.replacedById) {
        this.logger.warn(
          `refresh replay detected for user ${session.userId} (session ${session.id}) — revoking family`,
        );
        await this.revokeAllSessions(session.userId, session.tenantId);
      }
      throw new UnauthorizedException('invalid refresh token');
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('invalid refresh token');
    }

    const user = session.user;
    if (!user || user.deletedAt)
      throw new UnauthorizedException('invalid refresh token');
    const membership = user.tenants[0];
    if (!membership) throw new UnauthorizedException('invalid refresh token');

    // Rotate + issue in ONE transaction: the updateMany guard retires the
    // old session only if nobody else did; on a race the transaction rolls
    // back so the loser leaves no orphan session behind.
    let issued;
    try {
      issued = await this.prisma.withPlatformContext(async (tx) => {
        const next = await this.issueTokensIn(
          tx,
          membership.tenant,
          user.id,
          user.email,
          membership.tenantId,
          membership.role as Role,
          membership.patientId ?? undefined,
          meta,
        );
        const rotated = await tx.refreshSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: {
            revokedAt: new Date(),
            replacedById: next.sessionId,
            lastUsedAt: new Date(),
          },
        });
        if (rotated.count !== 1) throw new RefreshRaceError();
        return next;
      });
    } catch (err) {
      if (!(err instanceof RefreshRaceError)) throw err;
      // Lost a race against a concurrent refresh with the same token — treat
      // exactly like a replay so the winner doesn't keep a stale sibling.
      await this.revokeAllSessions(session.userId, session.tenantId);
      throw new UnauthorizedException('invalid refresh token');
    }
    return issued.body;
  }

  // ────────────────────────────────────────────────────────────────
  // Logout
  // ────────────────────────────────────────────────────────────────

  /** Revoke the one session behind `refreshToken`. Idempotent. */
  async logout(userId: string, refreshToken: string | undefined) {
    if (!refreshToken) return { revoked: 0 };
    const res = await this.prisma.withPlatformContext((tx) =>
      tx.refreshSession.updateMany({
        where: { tokenHash: hashToken(refreshToken), userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    return { revoked: res.count };
  }

  /**
   * Revoke by token alone — for the public logout route, where the access
   * token may already be expired. The hash is unguessable, so possession of
   * the refresh token is the authorisation.
   */
  async logoutByToken(refreshToken: string | undefined) {
    if (!refreshToken) return { revoked: 0 };
    const res = await this.prisma.withPlatformContext((tx) =>
      tx.refreshSession.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    return { revoked: res.count };
  }

  /** "Sign out everywhere" for the caller in their current tenant. */
  async logoutAll(userId: string, tenantId: string) {
    const revoked = await this.revokeAllSessions(userId, tenantId);
    return { revoked };
  }

  /**
   * Revoke every live refresh session for a user (optionally scoped to one
   * tenant). Used by logout-all, replay detection, member suspension /
   * removal and password reset. Access tokens keep working until they
   * expire (JWT_EXPIRES_IN, 15m by default) — keep that TTL short.
   */
  async revokeAllSessions(userId: string, tenantId?: string): Promise<number> {
    const res = await this.prisma.withPlatformContext((tx) =>
      tx.refreshSession.updateMany({
        where: { userId, ...(tenantId ? { tenantId } : {}), revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    return res.count;
  }

  // ────────────────────────────────────────────────────────────────
  // Forgot / reset password
  // ────────────────────────────────────────────────────────────────

  /**
   * Always resolves to the same 200 whether or not the email exists, so the
   * endpoint can't be used to enumerate accounts. Rate-limited at the
   * controller.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.withPlatformContext((tx) =>
      tx.user.findUnique({
        where: { email },
        select: { id: true, name: true, deletedAt: true },
      }),
    );
    const generic = { ok: true as const };
    if (!user || user.deletedAt) {
      this.logger.log(
        `forgot-password for unknown email (${email.replace(/(.).+(@.+)/, '$1***$2')})`,
      );
      return generic;
    }

    const token = generateOpaqueToken();
    await this.prisma.withPlatformContext(async (tx) => {
      // One live token per user — invalidate older unused ones so a
      // forgotten earlier email can't be replayed after a newer reset.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + this.resetTtlMin * 60_000),
        },
      });
    });

    const base =
      this.config.get<string>('PORTAL_BASE_URL') ?? 'http://localhost:4000';
    const url = `${base}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mailer.send({
      to: email,
      subject: 'Reset your ClinIQ password',
      text:
        `Hi ${user.name},\n\n` +
        `Someone asked to reset the password for this ClinIQ account. ` +
        `If that was you, open the link below within ${this.resetTtlMin} minutes:\n\n${url}\n\n` +
        `If you didn't ask for this, ignore this email — your password is unchanged.`,
    });

    return this.exposeDebugTokens ? { ...generic, debugToken: token } : generic;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const row = await this.prisma.withPlatformContext((tx) =>
      tx.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(dto.token) },
        include: { user: { select: { id: true, deletedAt: true } } },
      }),
    );
    if (
      !row ||
      row.usedAt ||
      row.expiresAt < new Date() ||
      row.user.deletedAt
    ) {
      throw new ForbiddenException('reset link is invalid or has expired');
    }

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.withPlatformContext(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ForbiddenException('reset link has already been used');
      }
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
    });
    // A password reset is exactly when a user wants every other device out.
    await this.revokeAllSessions(row.userId);
    this.logger.log(`password reset for user ${row.userId}`);
    return { ok: true as const };
  }

  // ────────────────────────────────────────────────────────────────
  // Token issue
  // ────────────────────────────────────────────────────────────────

  /**
   * Standalone token issuance for callers that don't already hold a
   * transaction. Everything happens in one withPlatformContext (tenant
   * snapshot + session row) instead of the two it used to take.
   */
  private async issueTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: Role,
    patientId?: string,
    meta: ClientMeta = {},
  ) {
    return this.prisma.withPlatformContext(async (tx) => {
      // Snapshot tenant kind into the token so the web client knows which
      // UI shell to render without an extra round-trip.
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: TENANT_SNAPSHOT,
      });
      return this.issueTokensIn(
        tx,
        tenant,
        userId,
        email,
        tenantId,
        role,
        patientId,
        meta,
      );
    });
  }

  /**
   * Sign the access token and create the refresh session row on an
   * already-open platform-context transaction. The caller supplies the
   * tenant snapshot it loaded alongside the user, so this adds exactly two
   * statements (create + update) and no transaction of its own.
   */
  private async issueTokensIn(
    tx: PrismaClient,
    tenant: TenantSnapshot,
    userId: string,
    email: string,
    tenantId: string,
    role: Role,
    patientId?: string,
    meta: ClientMeta = {},
  ) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessTtl = this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
    const refreshTtl =
      this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '7d';
    const tk = tenant?.kind === 'LAB' ? 'LAB' : 'CLINIC';

    const access = await signJwt(
      {
        sub: userId,
        tid: tenantId,
        role,
        email,
        tk,
        ...(patientId ? { pid: patientId } : {}),
      },
      { secret, expiresIn: accessTtl },
    );

    // Create the session row first so its id can ride inside the JWT; the
    // tokenHash is filled in once we know the signed token. Both writes sit
    // in the caller's transaction so a signing failure leaves no orphan row.
    const session = await tx.refreshSession.create({
      data: {
        userId,
        tenantId,
        tokenHash: `pending:${generateOpaqueToken()}`,
        expiresAt: new Date(Date.now() + parseDurationMs(refreshTtl)),
        userAgent: meta.userAgent?.slice(0, 256),
        ip: meta.ip?.slice(0, 64),
      },
    });
    const refresh = await signJwt(
      {
        sub: userId,
        tid: tenantId,
        role,
        tk,
        sid: session.id,
        ...(patientId ? { pid: patientId } : {}),
      },
      {
        secret,
        expiresIn: refreshTtl,
        audience: JWT_AUDIENCES.TENANT_REFRESH,
      },
    );
    await tx.refreshSession.update({
      where: { id: session.id },
      data: { tokenHash: hashToken(refresh) },
    });
    const sessionId = session.id;

    this.logger.log(
      `Issued tokens for user ${userId} in tenant ${tenantId} (kind=${tk})`,
    );
    return {
      sessionId,
      body: {
        accessToken: access,
        refreshToken: refresh,
        tokenType: 'Bearer',
        expiresIn: accessTtl,
        user: {
          id: userId,
          email,
          tenantId,
          tenantKind: tk,
          role,
          patientId: patientId ?? null,
          // plan / labPlan ride along so the web can render plan-gated UI
          // (disabled nav items, upgrade badges) without an extra round-trip.
          plan: tenant?.plan ?? null,
          labPlan: tenant?.labPlan ?? null,
        },
      },
    };
  }
}
