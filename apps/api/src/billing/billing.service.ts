import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentStatus,
  PrismaService,
  type PrismaClient,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { UpsertEntitlementDto } from './dto/billing.dto.js';
import {
  PH_DEFAULT_RULES,
  applyStatutoryDiscount,
  entitlementIsActive,
  selectEntitlement,
  type EntitlementType,
  type StatutoryRule,
} from './ph-statutory.js';
import type {
  CreateInvoiceDto,
  CreateServiceDto,
  RecordPaymentDto,
} from './dto/billing.dto.js';
import { renderInvoicePdf } from './pdf/render-invoice-pdf.js';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Services catalog ──────────────────────────────
  async listServices(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.service.findMany({
        where: { tenantId: user.tenantId, active: true },
        orderBy: { name: 'asc' },
      }),
    );
  }
  async createService(dto: CreateServiceDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.service.create({ data: { tenantId: user.tenantId, ...dto } }),
    );
  }

  /**
   * Work out which statutory discount a patient is entitled to, if any.
   *
   * Returns null when the patient holds no active entitlement, which is the
   * common case and must stay free of surprises: an invoice for a patient
   * with no entitlement is computed exactly as it was before this existed.
   *
   * A patient holding both a senior citizen and a PWD ID gets ONE discount.
   * RA 10754's IRR is explicit that they do not stack.
   */
  private async resolveStatutoryClaim(
    tx: PrismaClient,
    tenantId: string,
    patientId: string,
    grossCentavos: number,
  ) {
    const now = new Date();
    const entitlements = await tx.patientEntitlement.findMany({
      where: { patientId, deletedAt: null },
    });
    const active = entitlements.filter((e) => entitlementIsActive(e, now));
    if (active.length === 0) return null;

    const rules = await tx.discountRule.findMany({
      where: {
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    // A tenant that has configured nothing gets the statute. Seeding the
    // defaults into the table would make the law look like a local choice.
    const ruleFor = (type: EntitlementType): StatutoryRule => {
      const configured = rules.find((r) => r.type === type);
      return configured
        ? { percent: configured.percent, vatExempt: configured.vatExempt }
        : PH_DEFAULT_RULES[type];
    };

    const chosen = selectEntitlement(
      active.map((e) => ({
        type: e.type as EntitlementType,
        rule: ruleFor(e.type as EntitlementType),
        entitlement: e,
      })),
    );
    if (!chosen) return null;

    const vatPercent = await this.tenantVatPercent(tx, tenantId);
    return {
      entitlementId: chosen.entitlement.id,
      idNumber: chosen.entitlement.idNumber,
      breakdown: applyStatutoryDiscount(grossCentavos, vatPercent, chosen.rule),
    };
  }

  /** The tenant's VAT rate, defaulting to the PH standard 12%. */
  private async tenantVatPercent(
    tx: PrismaClient,
    tenantId: string,
  ): Promise<number> {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as { vatPercent?: unknown };
    return typeof settings.vatPercent === 'number' && settings.vatPercent >= 0
      ? settings.vatPercent
      : 12;
  }

  // ── Statutory entitlements ────────────────────────

  /**
   * Record or replace a patient's entitlement of a given type.
   *
   * Upsert rather than insert: a renewed PWD ID is the same entitlement with
   * a new number, and letting both rows exist would leave two answers to
   * "which ID did we discount against".
   */
  async upsertEntitlement(
    patientId: string,
    dto: UpsertEntitlementDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient)
        throw new NotFoundException(`Patient ${patientId} not found`);

      if (dto.validFrom && dto.validUntil && dto.validUntil < dto.validFrom) {
        throw new BadRequestException('validUntil is before validFrom');
      }

      const existing = await tx.patientEntitlement.findFirst({
        where: { patientId, type: dto.type },
      });

      const data = {
        idNumber: dto.idNumber,
        validFrom: dto.validFrom ?? null,
        validUntil: dto.validUntil ?? null,
        // Verification is re-established on every update: a new ID number is
        // a new claim, and carrying the old sighting forward would vouch for
        // a document nobody has seen.
        verifiedAt: dto.verified ? new Date() : null,
        verifiedById: dto.verified ? user.userId : null,
        deletedAt: null,
      };

      if (existing) {
        return tx.patientEntitlement.update({
          where: { id: existing.id },
          data,
        });
      }
      return tx.patientEntitlement.create({
        data: {
          tenantId: user.tenantId,
          patientId,
          type: dto.type,
          ...data,
        },
      });
    });
  }

  /**
   * The entitlements on file for a patient.
   *
   * 404s on a patient this tenant does not have, rather than returning an
   * empty list. RLS already stops the data crossing, so this is about the
   * contract agreeing with `upsertEntitlement` — one of them 404ing and the
   * other quietly returning nothing is the kind of inconsistency a caller
   * builds a wrong assumption on.
   */
  async listEntitlements(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient)
        throw new NotFoundException(`Patient ${patientId} not found`);

      return tx.patientEntitlement.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { type: 'asc' },
      });
    });
  }

  /**
   * Withdraw an entitlement.
   *
   * Soft-deleted, not removed: invoices already issued reference it, and the
   * ID number on a receipt has to stay explicable.
   */
  async removeEntitlement(
    patientId: string,
    type: string,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.patientEntitlement.findFirst({
        where: { patientId, type: type as EntitlementType, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException(
          `No ${type} entitlement on file for patient ${patientId}`,
        );
      }
      await tx.patientEntitlement.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Invoices ──────────────────────────────────────
  async listInvoicesForPatient(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.invoice.findMany({
        where: { patientId, deletedAt: null },
        include: { items: true, payments: true },
        orderBy: { issuedAt: 'desc' },
      }),
    );
  }

  /**
   * Render an invoice as a printable PDF buffer. Pulls invoice + items +
   * payments + patient via RLS, then tenant + settings outside the RLS scope
   * (settings is needed for branding in the PDF header).
   */
  async renderInvoicePdf(
    invoiceId: string,
    user: AuthenticatedUser,
  ): Promise<Buffer> {
    const invoice = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      async (tx) => {
        const inv = await tx.invoice.findFirst({
          where: { id: invoiceId, deletedAt: null },
          include: {
            items: { orderBy: { id: 'asc' } },
            payments: { orderBy: { paidAt: 'asc' } },
            patient: {
              select: {
                mrn: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        });
        if (!inv) throw new NotFoundException(`Invoice ${invoiceId} not found`);
        return inv;
      },
    );

    // RLS: bare `this.prisma.tenant.findFirst` returns null because the
    // `current_tenant` GUC isn't set on the bare client. Wrap in withTenant.
    const tenant = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      (tx) =>
        tx.tenant.findFirst({
          where: { id: user.tenantId, deletedAt: null },
          select: { name: true, currency: true, settings: true },
        }),
    );
    if (!tenant) throw new NotFoundException('tenant not found');

    return renderInvoicePdf({
      invoice: {
        number: invoice.number,
        issuedAt: invoice.issuedAt,
        status: invoice.status,
        notes: invoice.notes,
        currency: invoice.currency,
        subtotalCentavos: invoice.subtotalCentavos,
        discountCentavos: invoice.discountCentavos,
        taxCentavos: invoice.taxCentavos,
        totalCentavos: invoice.totalCentavos,
        paidCentavos: invoice.paidCentavos,
        items: invoice.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPriceCentavos: it.unitPriceCentavos,
          totalCentavos: it.totalCentavos,
        })),
        payments: invoice.payments.map((p) => ({
          paidAt: p.paidAt,
          method: p.method,
          amountCentavos: p.amountCentavos,
          reference: p.reference,
        })),
      },
      patient: invoice.patient,
      tenant: {
        name: tenant.name,
        currency: tenant.currency,
        settings: tenant.settings as {
          branding?: {
            logoUrl?: string;
            tagline?: string;
            primaryColor?: string;
          };
          defaultInvoiceNotes?: string;
          vatPercent?: number;
        } | null,
      },
    });
  }

  async createInvoice(dto: CreateInvoiceDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient)
        throw new NotFoundException(`Patient ${dto.patientId} not found`);

      const gross = dto.items.reduce(
        (sum, i) => sum + i.unitPriceCentavos * i.quantity,
        0,
      );
      const manualDiscount = dto.discountCentavos ?? 0;

      // RA 9994 / RA 10754. Applied automatically rather than left to the
      // person at the counter to remember: it is a legal entitlement, not a
      // courtesy, and the failure mode of forgetting is that the clinic
      // quietly overcharges the patients least able to absorb it.
      const claim = await this.resolveStatutoryClaim(
        tx,
        user.tenantId,
        patient.id,
        gross,
      );

      // When a statutory discount applies the sale is recorded as the
      // VAT-exempt amount, not the VAT-inclusive list price — that is the
      // figure the BIR expects on the face of the invoice, and it keeps
      // `subtotal - discount + tax = total` true.
      const subtotal = claim ? claim.breakdown.vatExemptSaleCentavos : gross;
      const statutoryDiscount = claim?.breakdown.discountCentavos ?? 0;
      const discount = statutoryDiscount + manualDiscount;
      const tax = claim ? claim.breakdown.vatCentavos : (dto.taxCentavos ?? 0);
      const total = Math.max(0, subtotal - discount + tax);
      const number = await this.nextNumber(tx, user.tenantId);

      return tx.invoice.create({
        data: {
          tenantId: user.tenantId,
          patientId: patient.id,
          number,
          status: InvoiceStatus.SENT,
          subtotalCentavos: subtotal,
          discountCentavos: discount,
          taxCentavos: tax,
          totalCentavos: total,
          entitlementId: claim?.entitlementId ?? null,
          statutoryIdNumber: claim?.idNumber ?? null,
          statutoryDiscountCentavos: statutoryDiscount,
          vatExemptSaleCentavos: claim
            ? claim.breakdown.vatExemptSaleCentavos
            : 0,
          notes: dto.notes,
          createdById: user.userId,
          items: {
            create: dto.items.map((i) => ({
              tenantId: user.tenantId,
              serviceId: i.serviceId ?? null,
              description: i.description,
              quantity: i.quantity,
              unitPriceCentavos: i.unitPriceCentavos,
              totalCentavos: i.unitPriceCentavos * i.quantity,
            })),
          },
        },
        include: { items: true, payments: true },
      });
    });
  }

  async recordPayment(
    invoiceId: string,
    dto: RecordPaymentDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const inv = await tx.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        select: {
          id: true,
          totalCentavos: true,
          paidCentavos: true,
          status: true,
        },
      });
      if (!inv) throw new NotFoundException(`Invoice ${invoiceId} not found`);
      if (inv.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('Cannot pay a cancelled invoice');
      }

      const payment = await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          invoiceId: inv.id,
          amountCentavos: dto.amountCentavos,
          method: dto.method,
          reference: dto.reference,
          status: PaymentStatus.SUCCEEDED,
        },
      });

      const newPaid = inv.paidCentavos + dto.amountCentavos;
      const newStatus =
        newPaid >= inv.totalCentavos
          ? InvoiceStatus.PAID
          : newPaid > 0
            ? InvoiceStatus.PARTIAL
            : inv.status;

      await tx.invoice.update({
        where: { id: inv.id },
        data: { paidCentavos: newPaid, status: newStatus },
      });

      this.logger.log(`payment ${payment.id} recorded for invoice ${inv.id}`);
      return payment;
    });
  }

  private async nextNumber(
    tx: {
      invoice: {
        count: (a: { where: Record<string, unknown> }) => Promise<number>;
      };
    },
    tenantId: string,
  ): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const count = await tx.invoice.count({
      where: { tenantId, issuedAt: { gte: monthStart } },
    });
    return `INV-${yyyymm}-${String(count + 1).padStart(4, '0')}`;
  }
}
