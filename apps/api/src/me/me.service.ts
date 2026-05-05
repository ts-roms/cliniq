import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { BillingService } from '../billing/billing.service.js';

/**
 * Self-scoped service for the patient portal. Every method derives the patient
 * id from `user.patientId` (JWT `pid`), never from a path/body param. If the
 * caller's JWT lacks `pid`, every method 403s — staff JWTs cannot accidentally
 * hit /api/me/*.
 *
 * Cross-tenant safety still leans on PrismaService.withTenant + RLS; the
 * patient-id check below is an additional layer for the portal surface.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  private requirePatientId(user: AuthenticatedUser): string {
    if (!user.patientId) {
      throw new ForbiddenException('portal endpoint — caller is not a patient');
    }
    return user.patientId;
  }

  async profile(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: {
          id: true,
          mrn: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          sex: true,
          email: true,
          phone: true,
        },
      });
    });
  }

  async appointments(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.appointment.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { startsAt: 'desc' },
        take: 50,
      });
    });
  }

  async invoices(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.invoice.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { issuedAt: 'desc' },
        include: { items: true, payments: true },
        take: 50,
      });
    });
  }

  async records(user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const [allergies, medications, conditions, vitals, prescriptions, labOrders] =
        await Promise.all([
          tx.allergy.findMany({ where: { patientId } }),
          tx.medication.findMany({ where: { patientId }, orderBy: { startedOn: 'desc' } }),
          tx.condition.findMany({ where: { patientId }, orderBy: { diagnosedOn: 'desc' } }),
          tx.vital.findMany({ where: { patientId }, orderBy: { recordedAt: 'desc' }, take: 10 }),
          tx.prescription.findMany({
            where: { patientId, deletedAt: null },
            orderBy: { issuedAt: 'desc' },
            include: { items: true },
            take: 20,
          }),
          tx.labOrder.findMany({
            where: { patientId, deletedAt: null },
            include: { items: { orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
        ]);
      return { allergies, medications, conditions, vitals, prescriptions, labOrders };
    });
  }

  /**
   * Self-scoped PDF: verify the invoice belongs to this portal user's patient,
   * then delegate rendering to BillingService. The ownership check is the
   * critical bit — a portal user must not be able to render arbitrary invoice
   * PDFs from their tenant.
   */
  async invoicePdf(invoiceId: string, user: AuthenticatedUser): Promise<Buffer> {
    const patientId = this.requirePatientId(user);
    const owns = await this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.invoice.findFirst({
        where: { id: invoiceId, patientId, deletedAt: null },
        select: { id: true },
      }),
    );
    if (!owns) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    return this.billing.renderInvoicePdf(invoiceId, user);
  }
}
