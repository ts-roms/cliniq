import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentStatus, PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
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
  async renderInvoicePdf(invoiceId: string, user: AuthenticatedUser): Promise<Buffer> {
    const invoice = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
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
    });

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId, deletedAt: null },
      select: { name: true, currency: true, settings: true },
    });
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
          branding?: { logoUrl?: string; tagline?: string; primaryColor?: string };
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
      if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);

      const subtotal = dto.items.reduce(
        (sum, i) => sum + i.unitPriceCentavos * i.quantity,
        0,
      );
      const total = Math.max(
        0,
        subtotal - (dto.discountCentavos ?? 0) + (dto.taxCentavos ?? 0),
      );
      const number = await this.nextNumber(tx, user.tenantId);

      return tx.invoice.create({
        data: {
          tenantId: user.tenantId,
          patientId: patient.id,
          number,
          status: InvoiceStatus.SENT,
          subtotalCentavos: subtotal,
          discountCentavos: dto.discountCentavos ?? 0,
          taxCentavos: dto.taxCentavos ?? 0,
          totalCentavos: total,
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

  async recordPayment(invoiceId: string, dto: RecordPaymentDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const inv = await tx.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        select: { id: true, totalCentavos: true, paidCentavos: true, status: true },
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
    tx: { invoice: { count: (a: { where: Record<string, unknown> }) => Promise<number> } },
    tenantId: string,
  ): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const count = await tx.invoice.count({
      where: { tenantId, issuedAt: { gte: monthStart } },
    });
    return `INV-${yyyymm}-${String(count + 1).padStart(4, '0')}`;
  }
}
