import { Injectable } from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

interface RangeRow {
  bucket: Date;
  amount: bigint | number | null;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * KPI tiles for the owner dashboard. All counts/sums respect tenant via RLS.
   */
  async overview(user: AuthenticatedUser) {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const [
        patientsThisMonth,
        patientsLastMonth,
        activeConsults,
        revenueThisMonth,
        outstandingAr,
        consultsThisMonth,
        rxThisMonth,
        openDsr,
        suggestionsThisMonth,
      ] = await Promise.all([
        tx.patient.count({
          where: { deletedAt: null, createdAt: { gte: startOfMonth } },
        }),
        tx.patient.count({
          where: {
            deletedAt: null,
            createdAt: { gte: startOfLastMonth, lt: startOfMonth },
          },
        }),
        tx.consultation.count({
          where: { status: 'IN_PROGRESS' },
        }),
        tx.payment.aggregate({
          _sum: { amountCentavos: true },
          where: { status: 'SUCCEEDED', paidAt: { gte: startOfMonth } },
        }),
        tx.invoice.aggregate({
          _sum: { totalCentavos: true, paidCentavos: true },
          where: {
            status: { in: ['DRAFT', 'SENT', 'PARTIAL', 'OVERDUE'] },
            deletedAt: null,
          },
        }),
        tx.consultation.count({
          where: { startedAt: { gte: startOfMonth } },
        }),
        tx.prescription.count({
          where: { createdAt: { gte: startOfMonth } },
        }),
        tx.dataSubjectRequest.count({
          where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        }),
        tx.aiSuggestion.groupBy({
          by: ['kind', 'status'],
          where: { createdAt: { gte: startOfMonth } },
          _count: { _all: true },
        }),
      ]);

      const monthYear = currentMonthKey();
      const budget = await tx.aiBudget.findUnique({
        where: { tenantId_monthYear: { tenantId: user.tenantId, monthYear } },
      });

      const collected = revenueThisMonth._sum.amountCentavos ?? 0;
      const outstanding =
        (outstandingAr._sum.totalCentavos ?? 0) - (outstandingAr._sum.paidCentavos ?? 0);

      return {
        period: { from: startOfMonth.toISOString(), to: startOfTomorrow.toISOString() },
        patients: {
          addedThisMonth: patientsThisMonth,
          addedLastMonth: patientsLastMonth,
          deltaPct: pctDelta(patientsThisMonth, patientsLastMonth),
        },
        consults: {
          activeNow: activeConsults,
          startedThisMonth: consultsThisMonth,
        },
        revenue: {
          collectedCentavos: collected,
          outstandingCentavos: Math.max(outstanding, 0),
        },
        ai: {
          budgetCentavos: budget?.budgetCentavos ?? null,
          spentCentavos: budget?.spentCentavos ?? 0,
          hardStopped: budget?.hardStopped ?? false,
          suggestions: suggestionsThisMonth.map((g) => ({
            kind: g.kind,
            status: g.status,
            count: g._count._all,
          })),
        },
        prescriptions: { writtenThisMonth: rxThisMonth },
        compliance: { openDsr },
        startOfToday: startOfToday.toISOString(),
      };
    });
  }

  /**
   * Daily revenue for the requested window (default: last 30 days). Sums
   * SUCCEEDED payments per UTC day. Empty days are not filled — caller can
   * stitch the calendar if needed.
   */
  async revenueSeries(user: AuthenticatedUser, from?: Date, to?: Date) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rows = await tx.$queryRaw<RangeRow[]>`
        SELECT date_trunc('day', "paidAt") AS bucket,
               SUM("amountCentavos") AS amount
        FROM payments
        WHERE status = 'SUCCEEDED'
          AND "paidAt" >= ${start}
          AND "paidAt" < ${end}
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        points: rows.map((r) => ({
          date: new Date(r.bucket).toISOString().slice(0, 10),
          amountCentavos: Number(r.amount ?? 0),
        })),
      };
    });
  }

  /**
   * Top services by revenue for the window. Joins invoice_items × invoices
   * (only PAID/PARTIAL count toward revenue).
   */
  async topServices(user: AuthenticatedUser, from?: Date, to?: Date, limit = 10) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ description: string; cents: bigint | number | null; n: bigint | number | null }>
      >`
        SELECT ii.description AS description,
               SUM(ii."totalCentavos") AS cents,
               COUNT(*) AS n
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii."invoiceId"
        WHERE i.status IN ('PAID', 'PARTIAL')
          AND i."issuedAt" >= ${start}
          AND i."issuedAt" < ${end}
        GROUP BY ii.description
        ORDER BY cents DESC NULLS LAST
        LIMIT ${limit}
      `;
      return rows.map((r) => ({
        description: r.description,
        revenueCentavos: Number(r.cents ?? 0),
        count: Number(r.n ?? 0),
      }));
    });
  }

  /**
   * No-show + cancellation rate per provider for the window.
   */
  async noShowRate(user: AuthenticatedUser, from?: Date, to?: Date) {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          providerId: string;
          total: bigint | number;
          noshow: bigint | number;
          cancelled: bigint | number;
          completed: bigint | number;
        }>
      >`
        SELECT "providerId",
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'NO_SHOW') AS noshow,
               COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
               COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed
        FROM appointments
        WHERE "startsAt" >= ${start}
          AND "startsAt" < ${end}
        GROUP BY "providerId"
        ORDER BY total DESC
      `;
      return rows.map((r) => {
        const total = Number(r.total);
        const noshow = Number(r.noshow);
        return {
          providerId: r.providerId,
          total,
          noShow: noshow,
          cancelled: Number(r.cancelled),
          completed: Number(r.completed),
          noShowRate: total > 0 ? noshow / total : 0,
        };
      });
    });
  }
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
