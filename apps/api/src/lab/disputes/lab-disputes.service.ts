import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LabCaseDisputeKind,
  LabCaseDisputeStatus,
  PrismaService,
} from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { LabNotificationsService } from '../_shared/lab-notifications.service.js';

@Injectable()
export class LabDisputesService {
  private readonly logger = new Logger(LabDisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: LabNotificationsService,
  ) {}

  async open(
    caseId: string,
    kind: LabCaseDisputeKind,
    reason: string,
    user: AuthenticatedUser,
  ) {
    const dispute = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true, labTenantId: true, clinicTenantId: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      if (
        labCase.labTenantId !== user.tenantId &&
        labCase.clinicTenantId !== user.tenantId
      ) {
        throw new ForbiddenException('not your case');
      }
      // Allow at most one OPEN dispute per case at a time. Opening a new
      // one while another is open creates noise; ask the user to update
      // the existing thread.
      const open = await tx.labCaseDispute.findFirst({
        where: {
          caseId,
          status: LabCaseDisputeStatus.OPEN,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (open) {
        throw new BadRequestException(
          `there is already an open dispute (${open.id}) on this case`,
        );
      }
      return tx.labCaseDispute.create({
        data: {
          caseId,
          labTenantId: labCase.labTenantId,
          clinicTenantId: labCase.clinicTenantId,
          openedByUserId: user.userId,
          openedByTenantId: user.tenantId,
          kind,
          reason,
          status: LabCaseDisputeStatus.OPEN,
        },
        include: { messages: true },
      });
    });
    void this.notifyDisputeOpened(dispute.id, user.tenantId).catch((err) =>
      this.logger.warn(`dispute-open notify failed: ${(err as Error).message}`),
    );
    return dispute;
  }

  async listForCase(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      return tx.labCaseDispute.findMany({
        where: { caseId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });
  }

  async findById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dispute = await tx.labCaseDispute.findFirst({
        where: { id, deletedAt: null },
        include: {
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!dispute) throw new NotFoundException('dispute not found');
      return dispute;
    });
  }

  async addMessage(id: string, body: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dispute = await tx.labCaseDispute.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true, labTenantId: true, clinicTenantId: true },
      });
      if (!dispute) throw new NotFoundException('dispute not found');
      if (dispute.status !== LabCaseDisputeStatus.OPEN) {
        throw new BadRequestException(
          `cannot post on a ${dispute.status} dispute`,
        );
      }
      if (
        dispute.labTenantId !== user.tenantId &&
        dispute.clinicTenantId !== user.tenantId
      ) {
        throw new ForbiddenException('not your dispute');
      }
      return tx.labCaseDisputeMessage.create({
        data: {
          disputeId: id,
          senderUserId: user.userId,
          senderTenantId: user.tenantId,
          body,
        },
      });
    });
  }

  /**
   * Close out a dispute. The actor must be on the case's lab or clinic
   * side; either side can RESOLVE (mark a fix delivered) or REJECT (no
   * action will be taken). The opener can WITHDRAW their own dispute.
   */
  async close(
    id: string,
    status:
      | LabCaseDisputeStatus.RESOLVED
      | LabCaseDisputeStatus.REJECTED
      | LabCaseDisputeStatus.WITHDRAWN,
    notes: string | null,
    user: AuthenticatedUser,
  ) {
    const updated = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const dispute = await tx.labCaseDispute.findFirst({
        where: { id, deletedAt: null },
      });
      if (!dispute) throw new NotFoundException('dispute not found');
      if (dispute.status !== LabCaseDisputeStatus.OPEN) {
        throw new BadRequestException(`dispute is already ${dispute.status}`);
      }
      if (
        dispute.labTenantId !== user.tenantId &&
        dispute.clinicTenantId !== user.tenantId
      ) {
        throw new ForbiddenException('not your dispute');
      }
      if (
        status === LabCaseDisputeStatus.WITHDRAWN &&
        dispute.openedByUserId !== user.userId
      ) {
        throw new ForbiddenException('only the opener can withdraw');
      }
      return tx.labCaseDispute.update({
        where: { id },
        data: {
          status,
          resolvedByUserId: user.userId,
          resolvedAt: new Date(),
          resolutionNotes: notes ?? null,
        },
        include: {
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });
    void this.notifyDisputeClosed(updated.id, user.tenantId, status).catch((err) =>
      this.logger.warn(`dispute-close notify failed: ${(err as Error).message}`),
    );
    return updated;
  }

  // ── Notifications ────────────────────────────────────────

  private async notifyDisputeOpened(
    disputeId: string,
    actorTenantId: string,
  ): Promise<void> {
    const d = await this.prisma.withPlatformContext((tx) =>
      tx.labCaseDispute.findFirst({
        where: { id: disputeId },
        include: {
          case: {
            select: {
              refNumber: true,
              id: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
    );
    if (!d) return;
    const otherTenantId =
      actorTenantId === d.labTenantId ? d.clinicTenantId : d.labTenantId;
    const ref =
      d.case.refNumber !== null ? `#${d.case.refNumber}` : d.case.id.slice(-6);
    const url = this.notify.webUrl(
      otherTenantId === d.labTenantId
        ? `/lab/cases/${d.case.id}`
        : `/lab-cases/${d.case.id}`,
    );
    await this.notify.notifyOwner(otherTenantId, (r) => ({
      subject: `New dispute on case ${ref} (${d.kind})`,
      text:
        `Hi ${r.name ?? 'there'},\n\n` +
        `A dispute has been opened on case ${ref} (${d.case.product.name}).\n\n` +
        `Reason: ${d.reason}\n\n` +
        `Open it: ${url}\n\n— ClinIQ Lab`,
    }));
  }

  private async notifyDisputeClosed(
    disputeId: string,
    actorTenantId: string,
    status: LabCaseDisputeStatus,
  ): Promise<void> {
    const d = await this.prisma.withPlatformContext((tx) =>
      tx.labCaseDispute.findFirst({
        where: { id: disputeId },
        include: {
          case: { select: { refNumber: true, id: true } },
        },
      }),
    );
    if (!d) return;
    const otherTenantId =
      actorTenantId === d.labTenantId ? d.clinicTenantId : d.labTenantId;
    const ref =
      d.case.refNumber !== null ? `#${d.case.refNumber}` : d.case.id.slice(-6);
    const url = this.notify.webUrl(
      otherTenantId === d.labTenantId
        ? `/lab/cases/${d.case.id}`
        : `/lab-cases/${d.case.id}`,
    );
    await this.notify.notifyOwner(otherTenantId, (r) => ({
      subject: `Dispute on case ${ref} marked ${status}`,
      text:
        `Hi ${r.name ?? 'there'},\n\n` +
        `The dispute on case ${ref} has been ${status.toLowerCase()}.\n` +
        (d.resolutionNotes ? `\nNotes: ${d.resolutionNotes}\n` : '') +
        `\nOpen it: ${url}\n\n— ClinIQ Lab`,
    }));
  }
}
