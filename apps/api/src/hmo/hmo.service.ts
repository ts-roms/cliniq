import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  HmoClaimStatus,
  InvoiceStatus,
  NotificationKind,
  NotificationSeverity,
  PaymentMethod,
  PaymentStatus,
  PrismaService,
  type PrismaClient,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  CreateHmoMembershipDto,
  CreateHmoProviderDto,
  FileClaimDto,
  RecordHmoPaymentDto,
  UpdateClaimDto,
  UpdateProviderDto,
} from './dto/hmo.dto.js';

@Injectable()
export class HmoService {
  private readonly logger = new Logger(HmoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
  ) {}

  // ── Providers ─────────────────────────────────────

  listProviders(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.hmoProvider.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
    );
  }

  createProvider(dto: CreateHmoProviderDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.hmoProvider.findFirst({ where: { name: dto.name } });
      if (existing) throw new ConflictException(`Provider "${dto.name}" exists`);
      return tx.hmoProvider.create({
        data: { tenantId: user.tenantId, ...dto },
      });
    });
  }

  updateProvider(id: string, dto: UpdateProviderDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.hmoProvider.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException(`Provider ${id} not found`);
      return tx.hmoProvider.update({ where: { id }, data: dto });
    });
  }

  // ── Memberships ───────────────────────────────────

  listMemberships(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.hmoMembership.findMany({
        where: { patientId, active: true },
        include: { provider: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  addMembership(patientId: string, dto: CreateHmoMembershipDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
      });
      if (!patient) throw new NotFoundException(`Patient ${patientId} not found`);
      const provider = await tx.hmoProvider.findFirst({ where: { id: dto.providerId } });
      if (!provider) throw new NotFoundException(`Provider ${dto.providerId} not found`);
      const dup = await tx.hmoMembership.findFirst({
        where: { patientId, providerId: dto.providerId, active: true },
      });
      if (dup) throw new ConflictException('patient already has an active card with this provider');
      return tx.hmoMembership.create({
        data: {
          tenantId: user.tenantId,
          patientId,
          providerId: dto.providerId,
          memberId: dto.memberId,
          validFrom: dto.validFrom,
          validUntil: dto.validUntil,
        },
      });
    });
  }

  // ── Claims ────────────────────────────────────────

  listClaims(user: AuthenticatedUser, status?: HmoClaimStatus) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.hmoClaim.findMany({
        where: {
          deletedAt: null,
          ...(status ? { status } : {}),
        },
        include: {
          provider: { select: { id: true, name: true } },
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
          invoice: { select: { id: true, number: true, totalCentavos: true, paidCentavos: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  fileClaim(invoiceId: string, dto: FileClaimDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
      });
      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('cannot file claim against a cancelled invoice');
      }
      const membership = await tx.hmoMembership.findFirst({
        where: { id: dto.membershipId, patientId: invoice.patientId, active: true },
      });
      if (!membership) {
        throw new BadRequestException(
          'membership not found, inactive, or belongs to another patient',
        );
      }
      if (dto.claimedCentavos > invoice.totalCentavos) {
        throw new BadRequestException(
          `claimed ${dto.claimedCentavos} exceeds invoice total ${invoice.totalCentavos}`,
        );
      }
      const number = await this.nextClaimNumber(tx, user.tenantId);
      return tx.hmoClaim.create({
        data: {
          tenantId: user.tenantId,
          invoiceId,
          patientId: invoice.patientId,
          providerId: membership.providerId,
          membershipId: membership.id,
          number,
          status: HmoClaimStatus.SUBMITTED,
          claimedCentavos: dto.claimedCentavos,
          submittedAt: new Date(),
          notes: dto.notes,
          createdById: user.userId,
        },
      });
    });
  }

  async updateClaim(id: string, dto: UpdateClaimDto, user: AuthenticatedUser) {
    const updated = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const claim = await tx.hmoClaim.findFirst({
        where: { id, deletedAt: null },
      });
      if (!claim) throw new NotFoundException(`Claim ${id} not found`);
      if (claim.status === HmoClaimStatus.PAID) {
        throw new BadRequestException('cannot update a PAID claim');
      }
      const data: Record<string, unknown> = { ...dto };
      const reachingTerminal =
        dto.status === HmoClaimStatus.APPROVED ||
        dto.status === HmoClaimStatus.PARTIAL ||
        dto.status === HmoClaimStatus.DENIED ||
        dto.status === HmoClaimStatus.CANCELLED;
      if (reachingTerminal && !claim.resolvedAt) data['resolvedAt'] = new Date();
      if (dto.approvedCentavos !== undefined && dto.approvedCentavos > claim.claimedCentavos) {
        throw new BadRequestException('approved exceeds claimed');
      }
      return tx.hmoClaim.update({ where: { id }, data });
    });
    // Notify the claim creator on terminal transitions. Best-effort; not part
    // of the RLS-bound transaction.
    if (
      dto.status &&
      (dto.status === HmoClaimStatus.APPROVED ||
        dto.status === HmoClaimStatus.PARTIAL ||
        dto.status === HmoClaimStatus.DENIED) &&
      updated.createdById
    ) {
      void this.notif.notify({
        tenantId: user.tenantId,
        userId: updated.createdById,
        kind: NotificationKind.HMO_CLAIM_UPDATE,
        severity:
          dto.status === HmoClaimStatus.DENIED
            ? NotificationSeverity.WARNING
            : NotificationSeverity.INFO,
        title: `Claim ${updated.number}: ${dto.status}`,
        body:
          dto.status === HmoClaimStatus.DENIED
            ? (dto.denialReason ?? 'denied')
            : `approved ${updated.approvedCentavos / 100}`,
        link: `/admin/claims`,
        entityId: updated.id,
      });
    }
    return updated;
  }

  /**
   * Records the HMO's payout for a claim. Creates a `Payment` row on the
   * linked invoice with `method=HMO`, then bumps the invoice's paidCentavos +
   * status (PARTIAL/PAID) so the rest of billing stays consistent. Caps the
   * claim at PAID.
   */
  async recordHmoPayment(claimId: string, dto: RecordHmoPaymentDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const claim = await tx.hmoClaim.findFirst({
        where: { id: claimId, deletedAt: null },
      });
      if (!claim) throw new NotFoundException(`Claim ${claimId} not found`);
      if (claim.status === HmoClaimStatus.DENIED || claim.status === HmoClaimStatus.CANCELLED) {
        throw new BadRequestException('cannot record payment on a denied/cancelled claim');
      }
      if (claim.status === HmoClaimStatus.PAID) {
        throw new BadRequestException('claim already paid');
      }

      const invoice = await tx.invoice.findFirst({
        where: { id: claim.invoiceId, deletedAt: null },
      });
      if (!invoice) throw new NotFoundException('invoice for claim is missing');

      const remainingOnInvoice = Math.max(invoice.totalCentavos - invoice.paidCentavos, 0);
      if (dto.amountCentavos > remainingOnInvoice) {
        throw new BadRequestException(
          `payment ${dto.amountCentavos} exceeds invoice balance ${remainingOnInvoice}`,
        );
      }

      const payment = await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          invoiceId: claim.invoiceId,
          amountCentavos: dto.amountCentavos,
          method: PaymentMethod.HMO,
          reference: dto.reference,
          status: PaymentStatus.SUCCEEDED,
        },
      });

      const newPaid = invoice.paidCentavos + dto.amountCentavos;
      const newInvoiceStatus =
        newPaid >= invoice.totalCentavos ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidCentavos: newPaid, status: newInvoiceStatus },
      });

      const updatedClaim = await tx.hmoClaim.update({
        where: { id: claim.id },
        data: { status: HmoClaimStatus.PAID, resolvedAt: new Date() },
      });

      this.logger.log(
        `HMO claim ${claim.number} paid: +${dto.amountCentavos} on invoice ${invoice.id}`,
      );
      return { claim: updatedClaim, payment };
    });
  }

  // ── helpers ──────────────────────────────────────

  /**
   * Per-tenant claim number `CLM-YYYYMM-NNNN`. Uses count + 1 — fine until
   * concurrent submission collides; the unique index will throw and the
   * caller should retry. Production should switch to a sequence.
   */
  private async nextClaimNumber(tx: PrismaClient, tenantId: string): Promise<string> {
    const now = new Date();
    const prefix = `CLM-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthCount = await tx.hmoClaim.count({
      where: {
        tenantId,
        number: { startsWith: prefix },
      },
    });
    return `${prefix}-${String(monthCount + 1).padStart(4, '0')}`;
  }
}
