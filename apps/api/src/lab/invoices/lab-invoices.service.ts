import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LabCaseStatus,
  LabInvoiceStatus,
  LabPaymentLinkProvider,
  LabPaymentLinkStatus,
  PrismaService,
} from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { LabClinicLinksService } from '../clinic-links/lab-clinic-links.service.js';
import { LabPdfRenderingService } from '../_shared/pdf-rendering.service.js';
import { LabNotificationsService } from '../_shared/lab-notifications.service.js';
import { PaymongoService } from './paymongo.service.js';
import type {
  AddLabInvoiceItemDto,
  CreateLabInvoiceDto,
  CreatePaymentLinkDto,
  GenerateFromCasesDto,
  InvoiceFilterDto,
  LabInvoiceItemInputDto,
  RecordLabInvoicePaymentDto,
  UpdateInvoiceDto,
  UpdateInvoiceItemDto,
} from './dto/invoice.dto.js';

const TERMINAL_STATUSES: ReadonlySet<LabInvoiceStatus> = new Set([
  LabInvoiceStatus.PAID,
  LabInvoiceStatus.VOID,
]);

@Injectable()
export class LabInvoicesService {
  private readonly logger = new Logger(LabInvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly links: LabClinicLinksService,
    private readonly pdf: LabPdfRenderingService,
    private readonly notify: LabNotificationsService,
    private readonly paymongo: PaymongoService,
  ) {}

  // ── Lookups ──────────────────────────────────────────────

  async listForLab(user: AuthenticatedUser, filter: InvoiceFilterDto = {}) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labInvoice.findMany({
        where: {
          labTenantId: user.tenantId,
          deletedAt: null,
          ...(filter.status ? { status: filter.status } : {}),
          ...(filter.clinicTenantId ? { clinicTenantId: filter.clinicTenantId } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          clinic: { select: { id: true, slug: true, name: true } },
          _count: { select: { items: true, paymentLinks: true } },
        },
      }),
    );
  }

  async listForClinic(user: AuthenticatedUser, filter: InvoiceFilterDto = {}) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labInvoice.findMany({
        where: {
          clinicTenantId: user.tenantId,
          deletedAt: null,
          // Clinic side never sees DRAFT (lab is still composing) — shield
          // them from work-in-progress invoices.
          status:
            filter.status ?? {
              in: [
                LabInvoiceStatus.ISSUED,
                LabInvoiceStatus.PAID,
                LabInvoiceStatus.OVERDUE,
                LabInvoiceStatus.VOID,
              ],
            },
        },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          lab: { select: { id: true, slug: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
    );
  }

  async findById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const invoice = await tx.labInvoice.findFirst({
        where: { id, deletedAt: null },
        include: {
          items: { orderBy: [{ sortOrder: 'asc' }, { description: 'asc' }] },
          paymentLinks: { orderBy: [{ createdAt: 'desc' }] },
          lab: { select: { id: true, slug: true, name: true } },
          clinic: { select: { id: true, slug: true, name: true } },
        },
      });
      if (!invoice) throw new NotFoundException('invoice not found');
      // Hide DRAFTs from the clinic side. RLS already keeps cross-tenant
      // peeks out, but a clinic seeing a draft invoice is a leak too.
      if (
        invoice.status === LabInvoiceStatus.DRAFT &&
        invoice.clinicTenantId === user.tenantId &&
        invoice.labTenantId !== user.tenantId
      ) {
        throw new NotFoundException('invoice not found');
      }
      return invoice;
    });
  }

  // ── Create / update ──────────────────────────────────────

  async createDraft(dto: CreateLabInvoiceDto, user: AuthenticatedUser) {
    await this.assertLabTenant(user);
    const linked = await this.links.isLinkActive(user.tenantId, dto.clinicTenantId);
    if (!linked) {
      throw new BadRequestException('no active link with that clinic');
    }
    const items = dto.items ?? [];
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      // Verify any caseIds belong to this lab + clinic combo.
      await this.assertCaseOwnership(tx, items, user.tenantId, dto.clinicTenantId);

      const lines = items.map((it) => this.normalizeItem(it));
      const subtotal = lines.reduce((sum, it) => sum + it.amountCents, 0);
      const tax = dto.taxCents ?? 0;

      return tx.labInvoice.create({
        data: {
          labTenantId: user.tenantId,
          clinicTenantId: dto.clinicTenantId,
          status: LabInvoiceStatus.DRAFT,
          currency: dto.currency ?? 'PHP',
          subtotalCents: subtotal,
          taxCents: tax,
          totalCents: subtotal + tax,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          notes: dto.notes ?? null,
          createdByUserId: user.userId,
          items: lines.length
            ? {
                create: lines.map((it) => ({
                  caseId: it.caseId ?? null,
                  description: it.description,
                  qty: it.qty,
                  unitPriceCents: it.unitPriceCents,
                  amountCents: it.amountCents,
                  sortOrder: it.sortOrder,
                })),
              }
            : undefined,
        },
        include: { items: true, paymentLinks: true },
      });
    });
  }

  /**
   * Auto-assemble a draft invoice from the given LabCases. Each delivered
   * case becomes one line item priced from `LabCase.unitPrice`. Cases must
   * belong to the requesting lab and the target clinic, must be DELIVERED,
   * and must not already appear on a non-VOID invoice.
   */
  async generateFromCases(dto: GenerateFromCasesDto, user: AuthenticatedUser) {
    await this.assertLabTenant(user);
    const linked = await this.links.isLinkActive(user.tenantId, dto.clinicTenantId);
    if (!linked) {
      throw new BadRequestException('no active link with that clinic');
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const cases = await tx.labCase.findMany({
        where: {
          id: { in: dto.caseIds },
          labTenantId: user.tenantId,
          clinicTenantId: dto.clinicTenantId,
          deletedAt: null,
        },
        include: { product: { select: { name: true } } },
      });
      if (cases.length !== dto.caseIds.length) {
        throw new BadRequestException(
          'one or more cases not found / not owned by this lab + clinic',
        );
      }
      const wrongStatus = cases.find((c) => c.status !== LabCaseStatus.DELIVERED);
      if (wrongStatus) {
        throw new BadRequestException(
          `case ${wrongStatus.refNumber ?? wrongStatus.id} is ${wrongStatus.status}; only DELIVERED cases can be invoiced`,
        );
      }
      const missingPrice = cases.find((c) => c.unitPrice === null);
      if (missingPrice) {
        throw new BadRequestException(
          `case ${missingPrice.refNumber ?? missingPrice.id} has no unitPrice — set it before invoicing`,
        );
      }
      // Block re-billing: any existing line item on a non-VOID invoice for
      // these cases means we'd double-bill. We allow re-billing of cases
      // whose previous invoice was VOID.
      const already = await tx.labInvoiceItem.findMany({
        where: {
          caseId: { in: dto.caseIds },
          invoice: { status: { not: LabInvoiceStatus.VOID }, deletedAt: null },
        },
        select: { caseId: true, invoiceId: true },
      });
      if (already.length > 0) {
        const dup = cases.find((c) => already.some((a) => a.caseId === c.id));
        throw new BadRequestException(
          `case ${dup?.refNumber ?? dup?.id} is already on invoice ${already[0]?.invoiceId}`,
        );
      }

      const lines = cases.map((c, idx) => {
        const ref = c.refNumber !== null ? `#${c.refNumber}` : c.id.slice(-6);
        return {
          caseId: c.id,
          description: `${c.product.name} — case ${ref}`,
          qty: 1,
          unitPriceCents: c.unitPrice ?? 0,
          amountCents: c.unitPrice ?? 0,
          sortOrder: idx,
        };
      });
      const subtotal = lines.reduce((sum, it) => sum + it.amountCents, 0);
      const tax = dto.taxCents ?? 0;

      return tx.labInvoice.create({
        data: {
          labTenantId: user.tenantId,
          clinicTenantId: dto.clinicTenantId,
          status: LabInvoiceStatus.DRAFT,
          currency: dto.currency ?? cases[0]?.currency ?? 'PHP',
          subtotalCents: subtotal,
          taxCents: tax,
          totalCents: subtotal + tax,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          notes: dto.notes ?? null,
          createdByUserId: user.userId,
          items: { create: lines },
        },
        include: { items: true, paymentLinks: true },
      });
    });
  }

  async update(id: string, dto: UpdateInvoiceDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const invoice = await this.loadDraftAsLab(tx, id, user.tenantId);
      const updates: Record<string, unknown> = {};
      if (dto.dueAt !== undefined) {
        updates.dueAt = dto.dueAt === null ? null : new Date(dto.dueAt);
      }
      if (dto.notes !== undefined) updates.notes = dto.notes;
      if (dto.taxCents !== undefined) {
        updates.taxCents = dto.taxCents;
        updates.totalCents = invoice.subtotalCents + dto.taxCents;
      }
      return tx.labInvoice.update({
        where: { id },
        data: updates,
        include: { items: true, paymentLinks: true },
      });
    });
  }

  // ── Items ────────────────────────────────────────────────

  async addItem(invoiceId: string, dto: AddLabInvoiceItemDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const invoice = await this.loadDraftAsLab(tx, invoiceId, user.tenantId);
      await this.assertCaseOwnership(
        tx,
        [dto],
        user.tenantId,
        invoice.clinicTenantId,
      );
      const it = this.normalizeItem(dto);
      const item = await tx.labInvoiceItem.create({
        data: {
          invoiceId,
          caseId: it.caseId ?? null,
          description: it.description,
          qty: it.qty,
          unitPriceCents: it.unitPriceCents,
          amountCents: it.amountCents,
          sortOrder: it.sortOrder,
        },
      });
      await this.recomputeTotals(tx, invoiceId);
      return item;
    });
  }

  async updateItem(
    invoiceId: string,
    itemId: string,
    dto: UpdateInvoiceItemDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.loadDraftAsLab(tx, invoiceId, user.tenantId);
      const existing = await tx.labInvoiceItem.findFirst({
        where: { id: itemId, invoiceId },
      });
      if (!existing) throw new NotFoundException('item not found');
      const qty = dto.qty ?? existing.qty;
      const unitPrice = dto.unitPriceCents ?? existing.unitPriceCents;
      const updated = await tx.labInvoiceItem.update({
        where: { id: itemId },
        data: {
          description: dto.description ?? existing.description,
          qty,
          unitPriceCents: unitPrice,
          amountCents: qty * unitPrice,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
        },
      });
      await this.recomputeTotals(tx, invoiceId);
      return updated;
    });
  }

  async deleteItem(invoiceId: string, itemId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await this.loadDraftAsLab(tx, invoiceId, user.tenantId);
      const existing = await tx.labInvoiceItem.findFirst({
        where: { id: itemId, invoiceId },
      });
      if (!existing) throw new NotFoundException('item not found');
      await tx.labInvoiceItem.delete({ where: { id: itemId } });
      await this.recomputeTotals(tx, invoiceId);
    });
  }

  // ── Lifecycle ────────────────────────────────────────────

  /** DRAFT → ISSUED. Allocates a per-lab refNumber. */
  async issue(id: string, user: AuthenticatedUser) {
    const updated = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const invoice = await this.loadDraftAsLab(tx, id, user.tenantId);
      if (invoice.totalCents <= 0) {
        throw new BadRequestException('cannot issue a zero-total invoice');
      }
      const max = await tx.labInvoice.aggregate({
        where: { labTenantId: user.tenantId },
        _max: { refNumber: true },
      });
      const refNumber = (max._max.refNumber ?? 0) + 1;
      const result = await tx.labInvoice.update({
        where: { id },
        data: {
          status: LabInvoiceStatus.ISSUED,
          refNumber,
          issuedAt: new Date(),
        },
        include: { items: true, paymentLinks: true },
      });
      this.logger.log(
        `lab invoice ${id} issued as ref ${refNumber} by ${user.userId}`,
      );
      return result;
    });
    // Fire-and-forget: notify the clinic owner. Wrapped so a mailer hiccup
    // never bubbles back to the controller and rolls back the transaction.
    void this.notifyInvoiceIssued(updated.id).catch((err) => {
      this.logger.warn(`invoice-issued notify failed: ${(err as Error).message}`);
    });
    return updated;
  }

  /**
   * Record a payment against an issued invoice. Adds to `paidCents`. If the
   * cumulative paid amount reaches the total, the invoice flips to PAID.
   * Lab-side only — clinic webhook flow lands in Phase 5.
   */
  async recordPayment(id: string, dto: RecordLabInvoicePaymentDto, user: AuthenticatedUser) {
    const { invoice, fullyPaid } = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      async (tx) => {
        const existing = await tx.labInvoice.findFirst({
          where: { id, labTenantId: user.tenantId, deletedAt: null },
        });
        if (!existing) throw new NotFoundException('invoice not found');
        if (TERMINAL_STATUSES.has(existing.status)) {
          throw new BadRequestException(
            `cannot record a payment on a ${existing.status} invoice`,
          );
        }
        if (existing.status === LabInvoiceStatus.DRAFT) {
          throw new BadRequestException('issue the invoice before recording payment');
        }
        const newPaid = existing.paidCents + dto.amountCents;
        if (newPaid > existing.totalCents) {
          throw new BadRequestException(
            `payment exceeds invoice total (paid ${newPaid} of ${existing.totalCents})`,
          );
        }
        const paidNow = newPaid === existing.totalCents;
        const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
        const result = await tx.labInvoice.update({
          where: { id },
          data: {
            paidCents: newPaid,
            status: paidNow ? LabInvoiceStatus.PAID : existing.status,
            paidAt: paidNow ? paidAt : existing.paidAt,
          },
          include: { items: true, paymentLinks: true },
        });
        this.logger.log(
          `lab invoice ${id} +${dto.amountCents} centavos${paidNow ? ' (PAID)' : ''} ${dto.reference ?? ''}`,
        );
        return { invoice: result, fullyPaid: paidNow };
      },
    );
    if (fullyPaid) {
      void this.notifyInvoicePaid(invoice.id).catch((err) => {
        this.logger.warn(`invoice-paid notify failed: ${(err as Error).message}`);
      });
    }
    return invoice;
  }

  /** Mark the invoice VOID. Allowed from any non-PAID state. */
  async voidInvoice(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const invoice = await tx.labInvoice.findFirst({
        where: { id, labTenantId: user.tenantId, deletedAt: null },
      });
      if (!invoice) throw new NotFoundException('invoice not found');
      if (invoice.status === LabInvoiceStatus.PAID) {
        throw new BadRequestException('paid invoices cannot be voided');
      }
      if (invoice.status === LabInvoiceStatus.VOID) return invoice;
      return tx.labInvoice.update({
        where: { id },
        data: { status: LabInvoiceStatus.VOID, voidedAt: new Date() },
        include: { items: true, paymentLinks: true },
      });
    });
  }

  // ── Payment links ────────────────────────────────────────

  /**
   * Create a payment link record on an issued invoice. For MVP this only
   * stores the metadata — wiring to PayMongo/GCash/Maya is deferred to
   * Phase 5 (the actual webhook + checkout creation lives there).
   */
  async createPaymentLink(
    invoiceId: string,
    dto: CreatePaymentLinkDto,
    user: AuthenticatedUser,
  ) {
    // Step 1: validate + reserve amount in our own tx. We don't open a
    // PayMongo link inside the DB transaction — outbound HTTP calls inside
    // a Postgres tx hold connections too long.
    const reservation = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const invoice = await tx.labInvoice.findFirst({
        where: { id: invoiceId, labTenantId: user.tenantId, deletedAt: null },
        include: { lab: { select: { name: true } }, clinic: { select: { name: true } } },
      });
      if (!invoice) throw new NotFoundException('invoice not found');
      if (invoice.status !== LabInvoiceStatus.ISSUED && invoice.status !== LabInvoiceStatus.OVERDUE) {
        throw new BadRequestException('payment links require an ISSUED or OVERDUE invoice');
      }
      const outstanding = invoice.totalCents - invoice.paidCents;
      if (outstanding <= 0) {
        throw new BadRequestException('invoice is already fully paid');
      }
      const amount = dto.amountCents ?? outstanding;
      if (amount > outstanding) {
        throw new BadRequestException('amount exceeds outstanding balance');
      }
      return { invoice, amount };
    });

    // Step 2: if the request asks for PayMongo and we have creds, hit the
    // hosted-checkout API. Otherwise persist a MANUAL placeholder.
    let externalId = dto.externalId ?? null;
    let url = dto.url ?? null;
    let provider = dto.provider ?? LabPaymentLinkProvider.MANUAL;
    if (provider === LabPaymentLinkProvider.PAYMONGO) {
      if (!this.paymongo.isConfigured) {
        throw new BadRequestException(
          'PayMongo not configured on this server — use MANUAL or set PAYMONGO_SECRET_KEY.',
        );
      }
      const ref =
        reservation.invoice.refNumber !== null
          ? `INV-${reservation.invoice.refNumber}`
          : reservation.invoice.id.slice(-6);
      const created = await this.paymongo.createLink({
        amountCents: reservation.amount,
        description: `${reservation.invoice.lab.name} ${ref}`,
        remarks: `Bill to ${reservation.invoice.clinic.name}`,
      });
      externalId = created.id;
      url = created.checkoutUrl;
    }

    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labPaymentLink.create({
        data: {
          invoiceId,
          provider,
          amountCents: reservation.amount,
          externalId,
          url,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: LabPaymentLinkStatus.PENDING,
        },
      }),
    );
  }

  async cancelPaymentLink(invoiceId: string, linkId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const invoice = await tx.labInvoice.findFirst({
        where: { id: invoiceId, labTenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!invoice) throw new NotFoundException('invoice not found');
      const link = await tx.labPaymentLink.findFirst({
        where: { id: linkId, invoiceId },
      });
      if (!link) throw new NotFoundException('payment link not found');
      if (link.status !== LabPaymentLinkStatus.PENDING) {
        throw new BadRequestException(`cannot cancel a ${link.status} link`);
      }
      return tx.labPaymentLink.update({
        where: { id: linkId },
        data: { status: LabPaymentLinkStatus.CANCELLED },
      });
    });
  }

  // ── Webhook handlers ─────────────────────────────────────

  /**
   * Handle a PayMongo webhook event. Called by the public webhook endpoint
   * after the raw-body signature has been verified. Looks up the matching
   * `LabPaymentLink` by `externalId`, marks it PAID, and applies the
   * payment to the parent invoice. Idempotent — re-deliveries of the same
   * event are no-ops.
   *
   * Bypasses tenant RLS via `withPlatformContext` because PayMongo doesn't
   * (and shouldn't) know which tenant owns the link. We re-derive the
   * tenant from `LabPaymentLink.invoice.labTenantId`.
   */
  async handlePaymongoEvent(event: {
    data: {
      attributes: {
        type: string;
        data: { id: string; type: string; attributes: { status?: string } };
      };
    };
  }): Promise<{ ok: boolean; reason?: string }> {
    const eventType = event.data.attributes.type;
    const inner = event.data.attributes.data;

    // We care about link-paid events. Other event types are acknowledged
    // (200 OK) but ignored — PayMongo retries on non-2xx.
    if (
      eventType !== 'link.payment.paid' &&
      eventType !== 'payment.paid' &&
      inner.type !== 'link'
    ) {
      return { ok: true, reason: `ignored event type ${eventType}` };
    }

    const linkId = inner.type === 'link' ? inner.id : null;
    if (!linkId) return { ok: true, reason: 'no link id on event' };

    const link = await this.prisma.withPlatformContext((tx) =>
      tx.labPaymentLink.findFirst({
        where: { externalId: linkId },
        include: {
          invoice: {
            select: {
              id: true,
              labTenantId: true,
              status: true,
              totalCents: true,
              paidCents: true,
              paidAt: true,
            },
          },
        },
      }),
    );
    if (!link) return { ok: true, reason: `unknown link ${linkId}` };
    if (link.status === LabPaymentLinkStatus.PAID) {
      return { ok: true, reason: 'already paid (idempotent replay)' };
    }

    // Apply the payment in the lab tenant's context so RLS-aware updates
    // emit the expected audit trail. We don't have a userId, use `null`.
    let fullyPaid = false;
    let invoiceId: string | null = null;
    await this.prisma.withTenant(link.invoice.labTenantId, null, async (tx) => {
      await tx.labPaymentLink.update({
        where: { id: link.id },
        data: {
          status: LabPaymentLinkStatus.PAID,
          paidAt: new Date(),
        },
      });
      const inv = await tx.labInvoice.findFirst({
        where: { id: link.invoice.id, deletedAt: null },
      });
      if (!inv) return;
      const newPaid = inv.paidCents + link.amountCents;
      const capped = Math.min(newPaid, inv.totalCents);
      fullyPaid = capped === inv.totalCents;
      invoiceId = inv.id;
      await tx.labInvoice.update({
        where: { id: inv.id },
        data: {
          paidCents: capped,
          status: fullyPaid ? LabInvoiceStatus.PAID : inv.status,
          paidAt: fullyPaid ? new Date() : inv.paidAt,
        },
      });
    });
    if (fullyPaid && invoiceId) {
      void this.notifyInvoicePaid(invoiceId).catch((err) =>
        this.logger.warn(`paid-notify failed: ${(err as Error).message}`),
      );
    }
    this.logger.log(
      `paymongo webhook applied: link=${link.id} invoice=${link.invoice.id} fullyPaid=${fullyPaid}`,
    );
    return { ok: true };
  }

  // ── Notifications ────────────────────────────────────────

  /** Notify the clinic OWNER that a new invoice is ready. */
  private async notifyInvoiceIssued(invoiceId: string): Promise<void> {
    const inv = await this.prisma.withPlatformContext((tx) =>
      tx.labInvoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: {
          lab: { select: { name: true } },
          clinic: { select: { id: true, name: true } },
        },
      }),
    );
    if (!inv) return;
    const ref = inv.refNumber !== null ? `INV-${inv.refNumber}` : inv.id.slice(-8);
    const total = `${inv.currency} ${(inv.totalCents / 100).toFixed(2)}`;
    const url = this.notify.webUrl(`/lab-invoices/${inv.id}`);
    await this.notify.notifyOwner(inv.clinicTenantId, (r) => ({
      subject: `Invoice ${ref} from ${inv.lab.name}`,
      text:
        `Hi ${r.name ?? 'there'},\n\n` +
        `${inv.lab.name} has issued invoice ${ref} to ${inv.clinic.name} for ${total}.\n` +
        (inv.dueAt ? `Due: ${inv.dueAt.toISOString().slice(0, 10)}\n\n` : '\n') +
        `View it here: ${url}\n\n` +
        `— ClinIQ Lab`,
      link: `/lab-invoices/${inv.id}`,
      entityId: inv.id,
    }));
  }

  /** Notify the lab OWNER that an invoice has been fully paid. */
  private async notifyInvoicePaid(invoiceId: string): Promise<void> {
    const inv = await this.prisma.withPlatformContext((tx) =>
      tx.labInvoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
        include: {
          lab: { select: { id: true, name: true } },
          clinic: { select: { name: true } },
        },
      }),
    );
    if (!inv) return;
    const ref = inv.refNumber !== null ? `INV-${inv.refNumber}` : inv.id.slice(-8);
    const total = `${inv.currency} ${(inv.totalCents / 100).toFixed(2)}`;
    const url = this.notify.webUrl(`/lab/billing/${inv.id}`);
    await this.notify.notifyOwner(inv.labTenantId, (r) => ({
      subject: `Invoice ${ref} marked PAID — ${inv.clinic.name}`,
      text:
        `Hi ${r.name ?? 'there'},\n\n` +
        `Invoice ${ref} (${total}) from ${inv.clinic.name} is now fully paid.\n\n` +
        `View it here: ${url}\n\n` +
        `— ClinIQ Lab`,
      link: `/lab/billing/${inv.id}`,
      entityId: inv.id,
    }));
  }

  // ── Monthly sweep ────────────────────────────────────────

  /**
   * For the requesting lab, find every clinic that had cases delivered in
   * the given period and (where any are not yet on a non-VOID invoice)
   * generate one draft invoice per clinic. Returns the new draft invoices.
   *
   * Idempotent: cases already on a non-VOID invoice are filtered out, so
   * re-running for the same period is safe. Period is `YYYY-MM` (e.g. the
   * UTC month — labs operating across timezones can adjust later).
   *
   * Triggered by:
   *   - Manual button in the lab billing UI ("Run for this month").
   *   - External scheduler (CloudWatch Event / GitHub Actions / Railway cron)
   *     hitting POST /lab/invoices/sweep with a service-account JWT, same
   *     pattern as /retention/run-now.
   */
  async runMonthlySweep(period: string | null, user: AuthenticatedUser) {
    await this.assertLabTenant(user);
    const range = resolvePeriod(period);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      // Find all DELIVERED cases for this lab in the period that aren't
      // already on a non-VOID invoice.
      const candidates = await tx.labCase.findMany({
        where: {
          labTenantId: user.tenantId,
          deletedAt: null,
          status: LabCaseStatus.DELIVERED,
          deliveredAt: { gte: range.from, lt: range.to },
          unitPrice: { not: null },
          invoiceItems: {
            none: {
              invoice: {
                status: { not: LabInvoiceStatus.VOID },
                deletedAt: null,
              },
            },
          },
        },
        select: {
          id: true,
          clinicTenantId: true,
          unitPrice: true,
          currency: true,
          refNumber: true,
          product: { select: { name: true } },
        },
      });
      if (candidates.length === 0) {
        return { period: range.label, invoicesCreated: 0, invoices: [] as { id: string }[] };
      }
      // Bucket by clinic.
      const byClinic = new Map<string, typeof candidates>();
      for (const c of candidates) {
        const list = byClinic.get(c.clinicTenantId) ?? [];
        list.push(c);
        byClinic.set(c.clinicTenantId, list);
      }
      const created: Array<{ id: string; clinicTenantId: string; totalCents: number }> = [];
      for (const [clinicTenantId, cases] of byClinic) {
        const lines = cases.map((c, idx) => {
          const ref =
            c.refNumber !== null ? `#${c.refNumber}` : c.id.slice(-6);
          return {
            caseId: c.id,
            description: `${c.product.name} — case ${ref}`,
            qty: 1,
            unitPriceCents: c.unitPrice ?? 0,
            amountCents: c.unitPrice ?? 0,
            sortOrder: idx,
          };
        });
        const subtotal = lines.reduce((sum, it) => sum + it.amountCents, 0);
        const inv = await tx.labInvoice.create({
          data: {
            labTenantId: user.tenantId,
            clinicTenantId,
            status: LabInvoiceStatus.DRAFT,
            currency: cases[0]?.currency ?? 'PHP',
            subtotalCents: subtotal,
            taxCents: 0,
            totalCents: subtotal,
            notes: `Auto-generated monthly summary for ${range.label}.`,
            createdByUserId: user.userId,
            items: { create: lines },
          },
          select: { id: true, clinicTenantId: true, totalCents: true },
        });
        created.push(inv);
        this.logger.log(
          `monthly sweep: created draft ${inv.id} for clinic ${clinicTenantId} (${cases.length} cases, ${inv.totalCents} centavos)`,
        );
      }
      return {
        period: range.label,
        invoicesCreated: created.length,
        invoices: created,
      };
    });
  }

  // ── PDF ──────────────────────────────────────────────────

  /**
   * Render a PDF for an invoice. Lab-side caller: regenerates always (so
   * post-issue edits like adding a note can refresh the artifact). Stores
   * `pdfFileKey` + `pdfFilename` on the invoice and returns a short-TTL
   * presigned download URL.
   */
  async generatePdfAsLab(id: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labInvoice.findFirst({
        where: { id, labTenantId: user.tenantId, deletedAt: null },
        include: {
          items: { orderBy: [{ sortOrder: 'asc' }, { description: 'asc' }] },
          lab: { select: { id: true, name: true, slug: true, kind: true } },
          clinic: { select: { id: true, name: true, slug: true } },
        },
      }),
    );
    if (!invoice) throw new NotFoundException('invoice not found');
    return this.renderAndPersist(invoice);
  }

  /**
   * Clinic-side download. Only for invoices that have been ISSUED (or later);
   * draft invoices stay invisible to the clinic. Generates lazily if no PDF
   * has been rendered yet.
   */
  async getPdfAsClinic(id: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labInvoice.findFirst({
        where: { id, clinicTenantId: user.tenantId, deletedAt: null },
        include: {
          items: { orderBy: [{ sortOrder: 'asc' }, { description: 'asc' }] },
          lab: { select: { id: true, name: true, slug: true, kind: true } },
          clinic: { select: { id: true, name: true, slug: true } },
        },
      }),
    );
    if (!invoice) throw new NotFoundException('invoice not found');
    if (invoice.status === LabInvoiceStatus.DRAFT) {
      throw new NotFoundException('invoice not found');
    }
    if (invoice.pdfFileKey && invoice.pdfFilename) {
      return this.pdf.presignDownload(invoice.pdfFileKey, invoice.pdfFilename);
    }
    return this.renderAndPersist(invoice);
  }

  private async renderAndPersist(invoice: InvoiceForPdf) {
    const filename = `invoice-${invoice.refNumber !== null ? `INV-${invoice.refNumber}` : invoice.id.slice(-8)}.pdf`;
    const keyPrefix = `lab-invoices/${invoice.labTenantId}/${new Date().toISOString().slice(0, 10)}`;
    const stored = await this.pdf.renderToS3(keyPrefix, filename, (doc) =>
      this.drawInvoice(doc, invoice),
    );
    // Persist on the invoice — bypass RLS via withPlatformContext only when
    // necessary; here the lab tenant owns the row, so a regular tenant tx is
    // enough. The presigner runs after the update commits.
    if (invoice.labTenantId) {
      await this.prisma.withTenant(invoice.labTenantId, null, (tx) =>
        tx.labInvoice.update({
          where: { id: invoice.id },
          data: { pdfFileKey: stored.s3Key, pdfFilename: stored.filename },
        }),
      );
    }
    return this.pdf.presignDownload(stored.s3Key, stored.filename);
  }

  private drawInvoice(doc: PDFKit.PDFDocument, invoice: InvoiceForPdf): void {
    const ref = invoice.refNumber !== null ? `INV-${invoice.refNumber}` : 'DRAFT';
    this.pdf.drawLetterhead(doc, {
      labName: invoice.lab.name,
      labKindLabel: invoice.lab.kind === 'LAB' ? 'Dental laboratory' : undefined,
      docTitle: 'Invoice',
      docRef: `Ref ${ref}  ·  Status ${invoice.status}`,
    });

    const meta: Array<{ label: string; value: string }> = [
      { label: 'Bill to', value: invoice.clinic.name },
      { label: 'Currency', value: invoice.currency },
      {
        label: 'Issued',
        value: invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : '—',
      },
      {
        label: 'Due',
        value: invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : '—',
      },
    ];
    this.pdf.drawKeyValueGrid(doc, meta, 2);

    // Line items table.
    const tableTop = doc.y + 6;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const usable = right - left;
    const colDesc = left;
    const colQty = left + usable * 0.62;
    const colUnit = left + usable * 0.74;
    const colAmt = right - 70;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#666');
    doc.text('DESCRIPTION', colDesc, tableTop);
    doc.text('QTY', colQty, tableTop, { width: 40, align: 'right' });
    doc.text('UNIT', colUnit, tableTop, { width: 80, align: 'right' });
    doc.text('AMOUNT', colAmt, tableTop, { width: 70, align: 'right' });
    doc.fillColor('black');
    doc.moveTo(left, tableTop + 14).lineTo(right, tableTop + 14).stroke();
    doc.y = tableTop + 18;

    doc.font('Helvetica').fontSize(10);
    if (invoice.items.length === 0) {
      doc.fillColor('#999').text('No line items.', left, doc.y).fillColor('black');
    }
    for (const it of invoice.items) {
      const y = doc.y;
      doc.text(it.description, colDesc, y, { width: colQty - colDesc - 6 });
      const yAfter = doc.y;
      doc.text(String(it.qty), colQty, y, { width: 40, align: 'right' });
      doc.text(formatMoney(it.unitPriceCents, invoice.currency), colUnit, y, {
        width: 80,
        align: 'right',
      });
      doc.text(formatMoney(it.amountCents, invoice.currency), colAmt, y, {
        width: 70,
        align: 'right',
      });
      doc.y = Math.max(yAfter, y + 14);
    }
    doc.moveDown(0.5);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals on the right.
    const totalsX = right - 220;
    const writeRow = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11);
      doc.text(label, totalsX, y, { width: 130, align: 'right' });
      doc.text(value, totalsX + 140, y, { width: 80, align: 'right' });
      doc.moveDown(0.2);
    };
    writeRow('Subtotal', formatMoney(invoice.subtotalCents, invoice.currency));
    writeRow('Tax', formatMoney(invoice.taxCents, invoice.currency));
    writeRow('Total', formatMoney(invoice.totalCents, invoice.currency), true);
    writeRow('Paid', formatMoney(invoice.paidCents, invoice.currency));
    writeRow(
      'Outstanding',
      formatMoney(invoice.totalCents - invoice.paidCents, invoice.currency),
      true,
    );

    if (invoice.notes) {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('NOTES', left);
      doc.font('Helvetica').fontSize(10).fillColor('black').text(invoice.notes, {
        width: usable,
      });
    }

    this.pdf.drawFooter(doc, `${invoice.lab.name} · Invoice ${ref}`);
  }

  // ── Internals ────────────────────────────────────────────

  private async assertLabTenant(user: AuthenticatedUser): Promise<void> {
    const tenant = await this.prisma.getTenantContext(user.tenantId);
    if (!tenant || tenant.kind !== 'LAB') {
      throw new ForbiddenException('only LAB tenants can manage invoices');
    }
  }

  private normalizeItem(it: LabInvoiceItemInputDto): {
    caseId: string | null;
    description: string;
    qty: number;
    unitPriceCents: number;
    amountCents: number;
    sortOrder: number;
  } {
    const qty = it.qty ?? 1;
    return {
      caseId: it.caseId ?? null,
      description: it.description,
      qty,
      unitPriceCents: it.unitPriceCents,
      amountCents: qty * it.unitPriceCents,
      sortOrder: it.sortOrder ?? 0,
    };
  }

  private async assertCaseOwnership(
    tx: Pick<PrismaService, 'labCase'>,
    items: Array<{ caseId?: string }>,
    labTenantId: string,
    clinicTenantId: string,
  ): Promise<void> {
    const ids = items
      .map((it) => it.caseId)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (ids.length === 0) return;
    const found = await tx.labCase.findMany({
      where: {
        id: { in: ids },
        labTenantId,
        clinicTenantId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (found.length !== new Set(ids).size) {
      throw new BadRequestException(
        'one or more cases not found / not owned by this lab + clinic',
      );
    }
  }

  /**
   * Reload an invoice and assert it's owned by the current lab + still in
   * DRAFT — the only state where line items / metadata are mutable.
   */
  private async loadDraftAsLab(
    tx: Pick<PrismaService, 'labInvoice'>,
    invoiceId: string,
    labTenantId: string,
  ) {
    const invoice = await tx.labInvoice.findFirst({
      where: { id: invoiceId, labTenantId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundException('invoice not found');
    if (invoice.status !== LabInvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `cannot edit a ${invoice.status} invoice`,
      );
    }
    return invoice;
  }

  private async recomputeTotals(
    tx: Pick<PrismaService, 'labInvoiceItem' | 'labInvoice'>,
    invoiceId: string,
  ): Promise<void> {
    const agg = await tx.labInvoiceItem.aggregate({
      where: { invoiceId },
      _sum: { amountCents: true },
    });
    const subtotal = agg._sum.amountCents ?? 0;
    const current = await tx.labInvoice.findFirst({
      where: { id: invoiceId },
      select: { taxCents: true },
    });
    const tax = current?.taxCents ?? 0;
    await tx.labInvoice.update({
      where: { id: invoiceId },
      data: {
        subtotalCents: subtotal,
        totalCents: subtotal + tax,
      },
    });
  }
}

interface InvoiceForPdf {
  id: string;
  refNumber: number | null;
  status: LabInvoiceStatus;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  issuedAt: Date | null;
  dueAt: Date | null;
  notes: string | null;
  pdfFileKey: string | null;
  pdfFilename: string | null;
  labTenantId: string;
  lab: { id: string; name: string; slug: string; kind: string };
  clinic: { id: string; name: string; slug: string };
  items: Array<{
    description: string;
    qty: number;
    unitPriceCents: number;
    amountCents: number;
  }>;
}

function formatMoney(cents: number, currency: string): string {
  const major = (cents / 100).toFixed(2);
  // Avoid Intl.NumberFormat in pdfkit context — pdfkit's default font lacks
  // some currency glyphs (₱). Fall back to a plain `<currency> <amount>`
  // string so the output renders identically across fonts.
  return `${currency} ${major}`;
}

/**
 * Resolve a YYYY-MM string (or null = previous calendar month UTC) into a
 * half-open [from, to) range. "Previous month" is the safer default for an
 * "auto-bill on the 1st" external scheduler — it always picks a complete
 * month even when the cron fires slightly past midnight.
 */
function resolvePeriod(input: string | null): { from: Date; to: Date; label: string } {
  let year: number;
  let month0: number; // 0-indexed
  if (input && /^\d{4}-\d{2}$/u.test(input)) {
    year = Number(input.slice(0, 4));
    month0 = Number(input.slice(5, 7)) - 1;
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month0 = now.getUTCMonth() - 1;
    if (month0 < 0) {
      month0 = 11;
      year -= 1;
    }
  }
  const from = new Date(Date.UTC(year, month0, 1));
  const to = new Date(Date.UTC(year, month0 + 1, 1));
  const label = `${year}-${String(month0 + 1).padStart(2, '0')}`;
  return { from, to, label };
}
