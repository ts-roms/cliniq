import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LabClinicLinkStatus, PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import type { InviteClinicDto } from './dto/invite.dto.js';

/**
 * Manages the many-to-many association between LAB tenants and CLINIC tenants.
 * Both sides see the same row; the link is mutated by either side depending
 * on action (lab invites/revokes, clinic accepts/rejects).
 *
 * RLS on `lab_clinic_links` ensures a tenant only sees rows where it appears
 * as either lab or clinic, so we don't have to re-check tenant ownership in
 * service code beyond the kind check.
 */
@Injectable()
export class LabClinicLinksService {
  private readonly logger = new Logger(LabClinicLinksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Lab → invites a clinic by slug. */
  async invite(dto: InviteClinicDto, user: AuthenticatedUser) {
    const lab = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, kind: true, name: true },
    });
    if (!lab || lab.kind !== 'LAB') {
      throw new ForbiddenException('only LAB tenants can invite clinics');
    }

    const slug = dto.clinicSlug.toLowerCase().trim();
    const clinic = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, kind: true, name: true, deletedAt: true },
    });
    if (!clinic || clinic.deletedAt) {
      throw new NotFoundException(`No tenant with slug "${slug}"`);
    }
    if (clinic.kind !== 'CLINIC') {
      throw new BadRequestException(`Tenant "${slug}" is not a clinic`);
    }
    if (clinic.id === lab.id) {
      throw new BadRequestException('cannot invite yourself');
    }

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labClinicLink.findFirst({
        where: { labTenantId: lab.id, clinicTenantId: clinic.id, deletedAt: null },
      });
      if (existing) {
        // Idempotent re-invite: revive a REJECTED/REVOKED link as PENDING.
        if (
          existing.status === LabClinicLinkStatus.REJECTED ||
          existing.status === LabClinicLinkStatus.REVOKED
        ) {
          this.logger.log(`Re-inviting clinic ${clinic.id} from lab ${lab.id}`);
          return tx.labClinicLink.update({
            where: { id: existing.id },
            data: {
              status: LabClinicLinkStatus.PENDING,
              invitedByUserId: user.userId,
              invitedAt: new Date(),
              respondedAt: null,
              inviteNote: dto.inviteNote ?? null,
            },
          });
        }
        throw new ConflictException(
          `Already linked with status ${existing.status}`,
        );
      }

      return tx.labClinicLink.create({
        data: {
          labTenantId: lab.id,
          clinicTenantId: clinic.id,
          status: LabClinicLinkStatus.PENDING,
          invitedByUserId: user.userId,
          inviteNote: dto.inviteNote ?? null,
        },
      });
    });
  }

  /** Lab → list of all links the lab has. */
  listForLab(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labClinicLink.findMany({
        where: { labTenantId: user.tenantId, deletedAt: null },
        orderBy: [{ invitedAt: 'desc' }],
        include: {
          clinic: {
            select: { id: true, slug: true, name: true, type: true },
          },
        },
      }),
    );
  }

  /** Clinic → list of incoming invitations + active links. */
  listForClinic(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labClinicLink.findMany({
        where: { clinicTenantId: user.tenantId, deletedAt: null },
        orderBy: [{ invitedAt: 'desc' }],
        include: {
          lab: {
            select: { id: true, slug: true, name: true, labSpecialty: true },
          },
        },
      }),
    );
  }

  /** Lab → revoke a pending invitation. */
  async revoke(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const link = await tx.labClinicLink.findFirst({
        where: { id, labTenantId: user.tenantId, deletedAt: null },
      });
      if (!link) throw new NotFoundException('invitation not found');
      if (link.status !== LabClinicLinkStatus.PENDING) {
        throw new BadRequestException(
          `Only PENDING invitations can be revoked (current: ${link.status})`,
        );
      }
      return tx.labClinicLink.update({
        where: { id },
        data: {
          status: LabClinicLinkStatus.REVOKED,
          respondedAt: new Date(),
        },
      });
    });
  }

  /** Clinic → accept an invitation. */
  async accept(id: string, user: AuthenticatedUser) {
    return this.transitionFromClinic(id, user, LabClinicLinkStatus.ACTIVE, [
      LabClinicLinkStatus.PENDING,
    ]);
  }

  /** Clinic → reject an invitation. */
  async reject(id: string, user: AuthenticatedUser) {
    return this.transitionFromClinic(id, user, LabClinicLinkStatus.REJECTED, [
      LabClinicLinkStatus.PENDING,
    ]);
  }

  /** Either side → suspend/unsuspend an active link. */
  async setStatus(
    id: string,
    targetStatus: LabClinicLinkStatus,
    user: AuthenticatedUser,
  ) {
    if (
      targetStatus !== LabClinicLinkStatus.SUSPENDED &&
      targetStatus !== LabClinicLinkStatus.ACTIVE
    ) {
      throw new BadRequestException('only SUSPENDED/ACTIVE allowed here');
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const link = await tx.labClinicLink.findFirst({
        where: {
          id,
          deletedAt: null,
          OR: [
            { labTenantId: user.tenantId },
            { clinicTenantId: user.tenantId },
          ],
        },
      });
      if (!link) throw new NotFoundException('link not found');
      if (
        link.status !== LabClinicLinkStatus.ACTIVE &&
        link.status !== LabClinicLinkStatus.SUSPENDED
      ) {
        throw new BadRequestException(
          `Link must be ACTIVE or SUSPENDED to toggle (current: ${link.status})`,
        );
      }
      return tx.labClinicLink.update({
        where: { id },
        data: { status: targetStatus, respondedAt: new Date() },
      });
    });
  }

  private async transitionFromClinic(
    id: string,
    user: AuthenticatedUser,
    next: LabClinicLinkStatus,
    allowedFrom: LabClinicLinkStatus[],
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const link = await tx.labClinicLink.findFirst({
        where: { id, clinicTenantId: user.tenantId, deletedAt: null },
      });
      if (!link) throw new NotFoundException('invitation not found');
      if (!allowedFrom.includes(link.status)) {
        throw new BadRequestException(
          `Cannot transition from ${link.status} to ${next}`,
        );
      }
      this.logger.log(
        `Clinic ${user.tenantId} ${next} invitation ${id} from lab ${link.labTenantId}`,
      );
      return tx.labClinicLink.update({
        where: { id },
        data: { status: next, respondedAt: new Date() },
      });
    });
  }

  /**
   * Public helper: is the given clinic linked-active with the given lab?
   * Used by lab order endpoints to confirm a clinic is allowed to place an
   * order with a particular lab. Bypasses the per-row RLS by using a
   * dedicated $queryRaw — no tenant context needed.
   */
  async isLinkActive(labTenantId: string, clinicTenantId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM "lab_clinic_links"
        WHERE "labTenantId"    = ${labTenantId}
          AND "clinicTenantId" = ${clinicTenantId}
          AND "status"         = 'ACTIVE'
          AND "deletedAt"      IS NULL
      ) AS "exists"
    `;
    return Boolean(rows[0]?.exists);
  }
}
