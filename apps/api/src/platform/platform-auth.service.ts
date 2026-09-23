import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, type PrismaClient } from '@org/db';
import {
  JWT_AUDIENCES,
  hashToken,
  parseDurationMs,
  signPlatformJwt,
  verifyPlatformJwt,
  verifyPassword,
  verifyTotp,
} from '@org/auth';
import type {
  PlatformLoginDto,
  PlatformRefreshDto,
} from './dto/platform-login.dto.js';

/** Matches the tenant-side defaults in auth.service.ts. */
const DEFAULT_LOCKOUT_THRESHOLD = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;

/** Thrown when a concurrent refresh already rotated the session. */
class RefreshRaceError extends Error {}

export interface PlatformClientMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Platform-operator auth.
 *
 * These accounts are not tenant-scoped and can change any tenant's plan and
 * status, so they get the same treatment the tenant side received in the P0
 * pass — previously they had neither:
 *
 *   * lockout after repeated failures, not just an ip-keyed throttle (which
 *     one attacker with several addresses walks straight past)
 *   * server-side refresh sessions with rotation and replay detection, so a
 *     captured refresh token can be revoked and `logout` actually ends the
 *     session instead of only clearing a cookie
 */
@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);
  private readonly lockoutThreshold: number;
  private readonly lockoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.lockoutThreshold = Number(
      this.config.get<string>('AUTH_LOCKOUT_THRESHOLD') ??
        DEFAULT_LOCKOUT_THRESHOLD,
    );
    this.lockoutMinutes = Number(
      this.config.get<string>('AUTH_LOCKOUT_MINUTES') ??
        DEFAULT_LOCKOUT_MINUTES,
    );
  }

  async login(dto: PlatformLoginDto, meta: PlatformClientMeta = {}) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email },
    });
    if (!admin || admin.deletedAt) {
      throw new UnauthorizedException('invalid credentials');
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      // Same shape as a bad password so the client renders one message and
      // the response does not confirm the address exists.
      this.logger.warn(`platform login refused for locked admin ${admin.id}`);
      throw new UnauthorizedException(
        'too many failed attempts — try again later',
      );
    }

    if (!(await verifyPassword(dto.password, admin.passwordHash))) {
      await this.recordFailedLogin(admin.id, admin.failedLoginCount);
      throw new UnauthorizedException('invalid credentials');
    }

    if (admin.mfaEnabled) {
      if (!dto.mfaCode) {
        throw new UnauthorizedException({
          message: 'mfa required',
          mfaRequired: true,
        });
      }
      // PlatformAdmin stores MFA state directly (MfaService is User-only).
      // Backup-code consumption still needs an enrollment flow; what changed
      // here is that a wrong code now counts toward the lockout, so TOTP
      // cannot be brute-forced once the password is known.
      const ok = !!admin.mfaSecret && verifyTotp(dto.mfaCode, admin.mfaSecret);
      if (!ok) {
        await this.recordFailedLogin(admin.id, admin.failedLoginCount);
        throw new UnauthorizedException({
          message: 'invalid mfa code',
          mfaRequired: true,
        });
      }
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data:
        admin.failedLoginCount > 0 || admin.lockedUntil
          ? { failedLoginCount: 0, lockedUntil: null, lastLogin: new Date() }
          : { lastLogin: new Date() },
    });

    return this.issueTokens(admin.id, admin.email, meta);
  }

  async refresh(dto: PlatformRefreshDto, meta: PlatformClientMeta = {}) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    let payload;
    try {
      payload = await verifyPlatformJwt(dto.refreshToken, {
        secret,
        audience: JWT_AUDIENCES.PLATFORM_REFRESH,
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }

    const session = await this.prisma.platformRefreshSession.findUnique({
      where: { tokenHash: hashToken(dto.refreshToken) },
      include: {
        admin: { select: { id: true, email: true, deletedAt: true } },
      },
    });
    if (!session || session.adminId !== payload.sub) {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (session.revokedAt) {
      // Rotated (replacedById set) = a token that was already exchanged is
      // being presented again — the stolen-token signature, so the whole
      // family goes. Revoked WITHOUT a successor is just a stale client.
      if (session.replacedById) {
        this.logger.warn(
          `platform refresh replay detected for admin ${session.adminId} ` +
            `(session ${session.id}) — revoking family`,
        );
        await this.revokeAllSessions(session.adminId);
      }
      throw new UnauthorizedException('invalid refresh token');
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (!session.admin || session.admin.deletedAt) {
      throw new UnauthorizedException('invalid refresh token');
    }

    // Rotate + issue together: the updateMany guard retires the old session
    // only if nobody else did, so a race leaves no orphan behind.
    try {
      return await this.prisma.$transaction(async (tx) => {
        const next = await this.issueTokensIn(
          tx,
          session.admin.id,
          session.admin.email,
          meta,
        );
        const rotated = await tx.platformRefreshSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: {
            revokedAt: new Date(),
            replacedById: next.sessionId,
            lastUsedAt: new Date(),
          },
        });
        if (rotated.count !== 1) throw new RefreshRaceError();
        return next.body;
      });
    } catch (err) {
      if (!(err instanceof RefreshRaceError)) throw err;
      // Lost a race against a concurrent refresh with the same token — treat
      // it exactly like a replay.
      await this.revokeAllSessions(session.adminId);
      throw new UnauthorizedException('invalid refresh token');
    }
  }

  /**
   * Revoke the one session behind `refreshToken`. Idempotent, and keyed on the
   * token alone — holding it is the authorization, which is what lets logout
   * work from an expired access token (mirrors auth.service.logoutByToken).
   */
  async logoutByToken(refreshToken: string | undefined) {
    if (!refreshToken) return { revoked: 0 };
    const res = await this.prisma.platformRefreshSession.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: res.count };
  }

  /** Revoke every live session for an admin (lost laptop, rotation). */
  async logoutAll(adminId: string) {
    const revoked = await this.revokeAllSessions(adminId);
    return { revoked };
  }

  private async revokeAllSessions(adminId: string): Promise<number> {
    const res = await this.prisma.platformRefreshSession.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }

  private async recordFailedLogin(adminId: string, previousCount: number) {
    const count = previousCount + 1;
    const lock = count >= this.lockoutThreshold;
    await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: {
        failedLoginCount: lock ? 0 : count,
        lockedUntil: lock
          ? new Date(Date.now() + this.lockoutMinutes * 60_000)
          : undefined,
      },
    });
    if (lock) {
      this.logger.warn(
        `platform admin ${adminId} locked for ${this.lockoutMinutes}m ` +
          `after ${count} failed attempts`,
      );
    }
  }

  private async issueTokens(
    adminId: string,
    email: string,
    meta: PlatformClientMeta,
  ) {
    const issued = await this.prisma.$transaction((tx) =>
      this.issueTokensIn(tx, adminId, email, meta),
    );
    return issued.body;
  }

  /**
   * Mint a token pair and persist the session backing the refresh token.
   * Takes a transaction client so rotation can retire the old session and
   * create the new one atomically.
   */
  private async issueTokensIn(
    tx: PrismaClient,
    adminId: string,
    email: string,
    meta: PlatformClientMeta,
  ) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessTtl =
      this.config.get<string>('PLATFORM_JWT_EXPIRES_IN') ?? '15m';
    const refreshTtl =
      this.config.get<string>('PLATFORM_REFRESH_TOKEN_EXPIRES_IN') ?? '7d';

    const access = await signPlatformJwt(
      { sub: adminId, email },
      { secret, expiresIn: accessTtl, audience: JWT_AUDIENCES.PLATFORM },
    );

    // The session row is created first so its id can ride inside the JWT;
    // the hash is filled in once the token is signed.
    const session = await tx.platformRefreshSession.create({
      data: {
        adminId,
        tokenHash: `pending:${adminId}:${Date.now()}:${Math.random()}`,
        expiresAt: new Date(Date.now() + parseDurationMs(refreshTtl)),
        userAgent: meta.userAgent?.slice(0, 256),
        ip: meta.ip?.slice(0, 64),
      },
    });

    const refresh = await signPlatformJwt(
      { sub: adminId, email, sid: session.id },
      {
        secret,
        expiresIn: refreshTtl,
        audience: JWT_AUDIENCES.PLATFORM_REFRESH,
      },
    );
    await tx.platformRefreshSession.update({
      where: { id: session.id },
      data: { tokenHash: hashToken(refresh) },
    });

    this.logger.log(`Issued platform tokens for admin ${adminId}`);
    return {
      sessionId: session.id,
      body: {
        accessToken: access,
        refreshToken: refresh,
        tokenType: 'Bearer',
        expiresIn: accessTtl,
        admin: { id: adminId, email },
      },
    };
  }
}
