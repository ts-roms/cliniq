import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { auditChanges } from '../audit/audit-trail.js';
import { ConfigService } from '@nestjs/config';
import { MemberStatus, PrismaService, Role, type PrismaClient } from '@org/db';
import { generateOpaqueToken, hashToken } from '@org/auth';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { AuthService } from '../auth/auth.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import type {
  ChangeRoleDto,
  ChangeStatusDto,
  CreateInviteDto,
  StaffRole,
} from './dto/members.dto.js';

const DEFAULT_INVITE_TTL_DAYS = 7;

const memberSelect = {
  id: true,
  role: true,
  status: true,
  joinedAt: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      lastLogin: true,
      mfaEnabled: true,
    },
  },
} as const;

const inviteSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Staff membership management for a tenant: who's in, with what role, and
 * the invite tokens that get people in. Everything is scoped through
 * withTenant so RLS backs every query; the only cross-tenant touch is
 * session revocation, which AuthService owns.
 *
 * Authority rules (enforced here, not just in RBAC):
 *   - OWNER can do anything to anyone except remove/demote the LAST owner.
 *   - ADMIN can invite/manage DOCTOR / NURSE / RECEPTIONIST / ADMIN, but can
 *     neither grant OWNER nor touch an existing OWNER.
 *   - Nobody edits their own membership through this API (no self-lockout,
 *     no self-promotion).
 *   - PATIENT memberships are invisible here; the portal owns them.
 */
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);
  private readonly inviteTtlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly mailer: MailerService,
  ) {
    this.inviteTtlDays = Number(
      this.config.get<string>('AUTH_INVITE_TTL_DAYS') ??
        DEFAULT_INVITE_TTL_DAYS,
    );
  }

  // ── Members ─────────────────────────────────────────────────────

  async list(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.tenantUser.findMany({
        where: { tenantId: user.tenantId, role: { not: Role.PATIENT } },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: memberSelect,
      }),
    );
  }

  async changeRole(
    memberId: string,
    dto: ChangeRoleDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanGrant(dto.role, actor);
    const updated = await this.prisma.withTenant(
      actor.tenantId,
      actor.userId,
      async (tx) => {
        const target = await this.loadStaffMember(tx, memberId, actor);
        this.assertCanTouch(target.role, actor);
        if (target.role === dto.role) return target;
        // Who may act in this clinic is the change an audit most often has to
        // answer for, and the previous role is the part that is otherwise
        // unrecoverable once it is overwritten.
        auditChanges({ role: target.role }, { role: dto.role });
        if (target.role === Role.OWNER && dto.role !== Role.OWNER) {
          await this.assertNotLastOwner(tx, actor.tenantId, target.id);
        }
        return tx.tenantUser.update({
          where: { id: target.id },
          data: { role: dto.role },
          select: memberSelect,
        });
      },
    );
    // The JWT snapshots the role; cut the refresh chain so the next access
    // token carries the new one instead of the old one for up to 7 days.
    await this.auth.revokeAllSessions(updated.user.id, actor.tenantId);
    this.logger.log(
      `member ${updated.id} role -> ${dto.role} by ${actor.userId}`,
    );
    return updated;
  }

  async changeStatus(
    memberId: string,
    dto: ChangeStatusDto,
    actor: AuthenticatedUser,
  ) {
    const updated = await this.prisma.withTenant(
      actor.tenantId,
      actor.userId,
      async (tx) => {
        const target = await this.loadStaffMember(tx, memberId, actor);
        this.assertCanTouch(target.role, actor);
        if (target.status === dto.status) return target;
        if (
          target.role === Role.OWNER &&
          dto.status === MemberStatus.SUSPENDED
        ) {
          await this.assertNotLastOwner(tx, actor.tenantId, target.id);
        }
        return tx.tenantUser.update({
          where: { id: target.id },
          data: { status: dto.status },
          select: memberSelect,
        });
      },
    );
    if (dto.status === MemberStatus.SUSPENDED) {
      await this.auth.revokeAllSessions(updated.user.id, actor.tenantId);
    }
    this.logger.log(
      `member ${updated.id} status -> ${dto.status} by ${actor.userId}`,
    );
    return updated;
  }

  async remove(memberId: string, actor: AuthenticatedUser) {
    const removed = await this.prisma.withTenant(
      actor.tenantId,
      actor.userId,
      async (tx) => {
        const target = await this.loadStaffMember(tx, memberId, actor);
        this.assertCanTouch(target.role, actor);
        if (target.role === Role.OWNER) {
          await this.assertNotLastOwner(tx, actor.tenantId, target.id);
        }
        await tx.tenantUser.delete({ where: { id: target.id } });
        return target;
      },
    );
    await this.auth.revokeAllSessions(removed.user.id, actor.tenantId);
    this.logger.log(
      `member ${removed.id} (${removed.user.email}) removed by ${actor.userId}`,
    );
    return { removed: true, id: removed.id };
  }

  // ── Invites ─────────────────────────────────────────────────────

  async listInvites(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.tenantInvite.findMany({
        where: { tenantId: user.tenantId, acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        select: inviteSelect,
      }),
    );
  }

  async createInvite(dto: CreateInviteDto, actor: AuthenticatedUser) {
    this.assertCanGrant(dto.role, actor);
    const email = dto.email.toLowerCase();

    const token = generateOpaqueToken();
    const { invite, tenant } = await this.prisma.withTenant(
      actor.tenantId,
      actor.userId,
      async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: actor.tenantId },
          select: { slug: true, name: true },
        });
        if (!tenant) throw new NotFoundException('tenant not found');

        const already = await tx.tenantUser.findFirst({
          where: { tenantId: actor.tenantId, user: { email } },
          select: { id: true },
        });
        if (already)
          throw new ConflictException(
            `${email} is already a member of this clinic`,
          );

        // Re-inviting supersedes any pending invite for the same address so
        // only one live link exists per (tenant, email).
        await tx.tenantInvite.updateMany({
          where: {
            tenantId: actor.tenantId,
            email,
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });

        const invite = await tx.tenantInvite.create({
          data: {
            tenantId: actor.tenantId,
            email,
            role: dto.role,
            tokenHash: hashToken(token),
            invitedByUserId: actor.userId,
            expiresAt: this.inviteExpiry(),
          },
          select: inviteSelect,
        });
        return { invite, tenant };
      },
    );

    const inviteUrl = this.inviteUrl(token, tenant.slug);
    await this.mailer.send({
      to: email,
      subject: `You have been invited to ${tenant.name} on ClinIQ`,
      text:
        `${invite.invitedBy.name} invited you to join ${tenant.name} as ${labelRole(dto.role)}.\n\n` +
        `Accept the invite (valid ${this.inviteTtlDays} days):\n${inviteUrl}\n\n` +
        `If you were not expecting this, you can ignore it.`,
    });

    this.logger.log(
      `invite ${invite.id} -> ${email} as ${dto.role} by ${actor.userId}`,
    );
    // The inviter legitimately needs the link (mail may be off in dev, or
    // they want to paste it into Viber). It never appears in listInvites().
    return { ...invite, inviteUrl };
  }

  async resendInvite(inviteId: string, actor: AuthenticatedUser) {
    const token = generateOpaqueToken();
    const { invite, tenant } = await this.prisma.withTenant(
      actor.tenantId,
      actor.userId,
      async (tx) => {
        const existing = await tx.tenantInvite.findFirst({
          where: {
            id: inviteId,
            tenantId: actor.tenantId,
            acceptedAt: null,
            revokedAt: null,
          },
          select: { id: true, role: true },
        });
        if (!existing) throw new NotFoundException('invite not found');
        this.assertCanGrant(existing.role as StaffRole, actor);
        const tenant = await tx.tenant.findUnique({
          where: { id: actor.tenantId },
          select: { slug: true, name: true },
        });
        if (!tenant) throw new NotFoundException('tenant not found');
        // Rotating the token invalidates the old email link.
        const invite = await tx.tenantInvite.update({
          where: { id: existing.id },
          data: { tokenHash: hashToken(token), expiresAt: this.inviteExpiry() },
          select: inviteSelect,
        });
        return { invite, tenant };
      },
    );
    const inviteUrl = this.inviteUrl(token, tenant.slug);
    await this.mailer.send({
      to: invite.email,
      subject: `Reminder: your invite to ${tenant.name} on ClinIQ`,
      text: `Accept your invite to ${tenant.name} (valid ${this.inviteTtlDays} days):\n${inviteUrl}`,
    });
    return { ...invite, inviteUrl };
  }

  async revokeInvite(inviteId: string, actor: AuthenticatedUser) {
    const res = await this.prisma.withTenant(
      actor.tenantId,
      actor.userId,
      (tx) =>
        tx.tenantInvite.updateMany({
          where: {
            id: inviteId,
            tenantId: actor.tenantId,
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        }),
    );
    if (res.count === 0) throw new NotFoundException('invite not found');
    return { revoked: true, id: inviteId };
  }

  /**
   * Public preview for the accept page: enough to render "Join <clinic> as
   * <role>" with the email locked, nothing more. 404 for anything that
   * isn't currently redeemable so the page can show one honest message.
   */
  async previewInvite(token: string) {
    if (!token) throw new NotFoundException('invite is invalid or has expired');
    const invite = await this.prisma.withPlatformContext((tx) =>
      tx.tenantInvite.findUnique({
        where: { tokenHash: hashToken(token) },
        select: {
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          tenant: { select: { slug: true, name: true } },
        },
      }),
    );
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt < new Date()
    ) {
      throw new NotFoundException('invite is invalid or has expired');
    }
    return {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      tenantSlug: invite.tenant.slug,
      tenantName: invite.tenant.name,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private inviteExpiry(): Date {
    return new Date(Date.now() + this.inviteTtlDays * 86_400_000);
  }

  private inviteUrl(token: string, slug: string): string {
    const base =
      this.config.get<string>('PORTAL_BASE_URL') ?? 'http://localhost:4000';
    return `${base}/signup?invite=${encodeURIComponent(token)}&tenant=${encodeURIComponent(slug)}`;
  }

  /** ADMIN may not hand out OWNER. */
  private assertCanGrant(role: StaffRole, actor: AuthenticatedUser) {
    if (role === Role.OWNER && actor.role !== Role.OWNER) {
      throw new ForbiddenException('only an owner can grant the owner role');
    }
  }

  /** ADMIN may not modify an OWNER. */
  private assertCanTouch(targetRole: Role, actor: AuthenticatedUser) {
    if (targetRole === Role.OWNER && actor.role !== Role.OWNER) {
      throw new ForbiddenException('only an owner can change another owner');
    }
  }

  private async loadStaffMember(
    tx: PrismaClient,
    memberId: string,
    actor: AuthenticatedUser,
  ) {
    const target = await tx.tenantUser.findFirst({
      where: { id: memberId, tenantId: actor.tenantId },
      select: memberSelect,
    });
    if (!target || target.role === Role.PATIENT)
      throw new NotFoundException('member not found');
    if (target.user.id === actor.userId) {
      throw new BadRequestException('you cannot change your own membership');
    }
    return target;
  }

  private async assertNotLastOwner(
    tx: PrismaClient,
    tenantId: string,
    excludingMemberId: string,
  ) {
    const others = await tx.tenantUser.count({
      where: {
        tenantId,
        role: Role.OWNER,
        status: MemberStatus.ACTIVE,
        id: { not: excludingMemberId },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'a clinic must keep at least one active owner',
      );
    }
  }
}

function labelRole(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
