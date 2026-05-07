import {
  ConflictException,
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
} from '@org/db';
import { hashPassword, verifyPassword, signJwt, verifyJwt, JWT_AUDIENCES, type Role } from '@org/auth';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { RegisterPatientDto } from './dto/register-patient.dto.js';
import type { RefreshTokenDto } from './dto/refresh.dto.js';
import { MfaService } from '../mfa/mfa.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
  ) {}

  /**
   * Register a new user inside an existing tenant.
   * For the bootstrap "create the first owner" path, use TenantsService.create instead.
   */
  async register(dto: RegisterDto) {
    // Public route — runs without a tenant context. Wrap reads + writes
    // in `withPlatformContext` so the cliniq_app role can satisfy RLS
    // (the regular policies require `current_tenant_id()` to match,
    // which is null at signup time).
    const tenant = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { slug: dto.tenantSlug } }),
    );
    if (!tenant) throw new UnauthorizedException('invalid tenant');
    if (tenant.status === TenantStatus.SUSPENDED || tenant.status === TenantStatus.CANCELLED) {
      throw new UnauthorizedException('tenant inactive');
    }

    const existing = await this.prisma.withPlatformContext((tx) =>
      tx.user.findUnique({ where: { email: dto.email } }),
    );
    if (existing) {
      throw new ConflictException('email already registered');
    }

    const passwordHash = await hashPassword(dto.password);

    const { user, tenantUser } = await this.prisma.withPlatformContext(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
      });
      // First user of a fresh tenant becomes OWNER so the signup flow has
      // someone with promotion rights. Subsequent registrations default to
      // RECEPTIONIST and rely on an OWNER/ADMIN to promote them.
      const memberCount = await tx.tenantUser.count({ where: { tenantId: tenant.id } });
      const role = memberCount === 0 ? DbRole.OWNER : DbRole.RECEPTIONIST;
      const tenantUser = await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role,
          status: MemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
      return { user, tenantUser };
    });

    return this.issueTokens(user.id, user.email, tenant.id, tenantUser.role as Role);
  }

  async login(dto: LoginDto) {
    // Login runs before any tenant context exists. Reads on `users` and
    // `tenant_users` need RLS bypass since the regular policies hide
    // rows that don't match `current_tenant_id()`.
    const user = await this.prisma.withPlatformContext((tx) =>
      tx.user.findUnique({
        where: { email: dto.email },
        include: { tenants: { where: { status: MemberStatus.ACTIVE }, take: 1 } },
      }),
    );
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('invalid credentials');
    }
    const membership = user.tenants[0];
    if (!membership) throw new UnauthorizedException('user has no active tenant');

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
        throw new UnauthorizedException({
          message: 'invalid mfa code',
          mfaRequired: true,
        });
      }
    }

    return this.issueTokens(
      user.id,
      user.email,
      membership.tenantId,
      membership.role as Role,
      membership.patientId ?? undefined,
    );
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
  async registerPatient(dto: RegisterPatientDto) {
    const tenant = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findUnique({ where: { slug: dto.tenantSlug } }),
    );
    if (!tenant) throw new UnauthorizedException('invalid tenant');
    if (tenant.status === TenantStatus.SUSPENDED || tenant.status === TenantStatus.CANCELLED) {
      throw new UnauthorizedException('tenant inactive');
    }

    const existingUser = await this.prisma.withPlatformContext((tx) =>
      tx.user.findUnique({ where: { email: dto.email } }),
    );
    if (existingUser) throw new ConflictException('email already registered');

    const passwordHash = await hashPassword(dto.password);

    const { user, tenantUser, patientId } = await this.prisma.withPlatformContext(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { tenantId: tenant.id, mrn: dto.mrn, deletedAt: null },
      });
      if (!patient) throw new UnauthorizedException('record not found');
      if (!patient.email || patient.email.toLowerCase() !== dto.email.toLowerCase()) {
        // Don't leak whether it's a missing email vs mismatch — same error.
        throw new UnauthorizedException('record could not be matched');
      }
      const alreadyLinked = await tx.tenantUser.findFirst({
        where: { tenantId: tenant.id, patientId: patient.id },
      });
      if (alreadyLinked) throw new ConflictException('record already has a portal account');

      const user = await tx.user.create({
        data: { email: dto.email, name: `${patient.firstName} ${patient.lastName}`, passwordHash },
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

    return this.issueTokens(user.id, user.email, tenant.id, tenantUser.role as Role, patientId);
  }

  /**
   * Verify the refresh token (audience=cliniq-refresh), re-load the user's
   * current tenant membership (role may have changed since token was issued),
   * and rotate both tokens. Throws 401 on any failure — never leaks why.
   */
  async refresh(dto: RefreshTokenDto) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    let payload;
    try {
      payload = await verifyJwt(dto.refreshToken, { secret, audience: JWT_AUDIENCES.TENANT_REFRESH });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }

    const user = await this.prisma.withPlatformContext((tx) =>
      tx.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, deletedAt: true },
      }),
    );
    if (!user || user.deletedAt) throw new UnauthorizedException('invalid refresh token');

    const membership = await this.prisma.withPlatformContext((tx) =>
      tx.tenantUser.findFirst({
        where: { userId: user.id, tenantId: payload.tid, status: MemberStatus.ACTIVE },
        select: { role: true, patientId: true, tenantId: true },
      }),
    );
    if (!membership) throw new UnauthorizedException('invalid refresh token');

    return this.issueTokens(
      user.id,
      user.email,
      membership.tenantId,
      membership.role as Role,
      membership.patientId ?? undefined,
    );
  }

  private async issueTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: Role,
    patientId?: string,
  ) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessTtl = this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
    const refreshTtl = this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '7d';

    // Snapshot tenant kind into the token so the web client knows which UI
    // shell to render without an extra round-trip.
    const tenant = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { kind: true },
      }),
    );
    const tk = tenant?.kind === 'LAB' ? 'LAB' : 'CLINIC';

    const access = await signJwt(
      { sub: userId, tid: tenantId, role, email, tk, ...(patientId ? { pid: patientId } : {}) },
      { secret, expiresIn: accessTtl },
    );
    const refresh = await signJwt(
      { sub: userId, tid: tenantId, role, tk, ...(patientId ? { pid: patientId } : {}) },
      { secret, expiresIn: refreshTtl, audience: JWT_AUDIENCES.TENANT_REFRESH },
    );

    this.logger.log(`Issued tokens for user ${userId} in tenant ${tenantId} (kind=${tk})`);
    return {
      accessToken: access,
      refreshToken: refresh,
      tokenType: 'Bearer',
      expiresIn: accessTtl,
      user: { id: userId, email, tenantId, tenantKind: tk, role, patientId: patientId ?? null },
    };
  }
}
