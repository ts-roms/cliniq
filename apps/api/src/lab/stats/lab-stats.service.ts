import { Injectable } from '@nestjs/common';
import { LabCaseStatus, LabInvoiceStatus, PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';

/**
 * Read-only aggregates for the lab stats panel. All queries scope by
 * `labTenantId = current_tenant`, and the RLS policies on the underlying
 * tables would catch anything that escaped that filter.
 *
 * Time series uses last 12 months by default — a stats dashboard is
 * pre-attentive ("did this trend up or down?"); deeper drill-downs go in
 * future BI tooling, not this panel.
 */
@Injectable()
export class LabStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const since = startOfMonthsAgo(12);

      const [casesByStatus, openCases, recentMonthlyCases, recentMonthlyRevenue, topClinics, outstandingTotal] =
        await Promise.all([
          // Cases-by-status histogram (lifetime).
          tx.labCase.groupBy({
            by: ['status'],
            where: { labTenantId: user.tenantId, deletedAt: null },
            _count: { _all: true },
          }),
          // Open caseload (anything not yet DELIVERED/CANCELLED/REJECTED).
          tx.labCase.count({
            where: {
              labTenantId: user.tenantId,
              deletedAt: null,
              status: {
                in: [
                  LabCaseStatus.SUBMITTED,
                  LabCaseStatus.IN_PROGRESS,
                  LabCaseStatus.AWAITING_PICKUP,
                  LabCaseStatus.SHIPPED,
                ],
              },
            },
          }),
          // Cases delivered per calendar month (last 12).
          tx.$queryRaw<Array<{ month: string; count: bigint }>>`
            SELECT to_char(date_trunc('month', "deliveredAt"), 'YYYY-MM') AS month,
                   COUNT(*)::bigint AS count
              FROM "lab_cases"
             WHERE "labTenantId" = ${user.tenantId}
               AND "deletedAt"   IS NULL
               AND "deliveredAt" IS NOT NULL
               AND "deliveredAt" >= ${since}
             GROUP BY 1
             ORDER BY 1
          `,
          // Revenue (sum of paidCents) per calendar month — paid invoices only.
          tx.$queryRaw<Array<{ month: string; cents: bigint }>>`
            SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS month,
                   COALESCE(SUM("paidCents"), 0)::bigint AS cents
              FROM "lab_invoices"
             WHERE "labTenantId" = ${user.tenantId}
               AND "deletedAt"   IS NULL
               AND "paidAt"      IS NOT NULL
               AND "paidAt"      >= ${since}
             GROUP BY 1
             ORDER BY 1
          `,
          // Top 5 clinics by paid revenue (lifetime).
          tx.$queryRaw<Array<{ clinic_id: string; clinic_name: string; cents: bigint; cases: bigint }>>`
            SELECT c."id"   AS clinic_id,
                   c."name" AS clinic_name,
                   COALESCE(SUM(i."paidCents"), 0)::bigint AS cents,
                   COUNT(DISTINCT lc."id")::bigint           AS cases
              FROM "tenants" c
              LEFT JOIN "lab_invoices" i
                     ON i."clinicTenantId" = c."id"
                    AND i."labTenantId"    = ${user.tenantId}
                    AND i."deletedAt" IS NULL
              LEFT JOIN "lab_cases" lc
                     ON lc."clinicTenantId" = c."id"
                    AND lc."labTenantId"    = ${user.tenantId}
                    AND lc."deletedAt" IS NULL
             WHERE c."id" IN (
                SELECT DISTINCT "clinicTenantId"
                  FROM "lab_clinic_links"
                 WHERE "labTenantId" = ${user.tenantId}
                   AND "deletedAt"   IS NULL
             )
             GROUP BY c."id", c."name"
             ORDER BY cents DESC, cases DESC
             LIMIT 5
          `,
          // Total outstanding (issued + overdue, unpaid balance).
          tx.labInvoice.aggregate({
            where: {
              labTenantId: user.tenantId,
              deletedAt: null,
              status: { in: [LabInvoiceStatus.ISSUED, LabInvoiceStatus.OVERDUE] },
            },
            _sum: { totalCents: true, paidCents: true },
          }),
        ]);

      const outstanding =
        (outstandingTotal._sum.totalCents ?? 0) - (outstandingTotal._sum.paidCents ?? 0);

      return {
        casesByStatus: Object.fromEntries(
          casesByStatus.map((r) => [r.status, r._count._all]),
        ) as Record<LabCaseStatus, number>,
        openCases,
        outstandingCents: outstanding,
        casesByMonth: recentMonthlyCases.map((r) => ({
          month: r.month,
          count: Number(r.count),
        })),
        revenueByMonth: recentMonthlyRevenue.map((r) => ({
          month: r.month,
          cents: Number(r.cents),
        })),
        topClinics: topClinics.map((r) => ({
          clinicId: r.clinic_id,
          name: r.clinic_name,
          revenueCents: Number(r.cents),
          cases: Number(r.cases),
        })),
      };
    });
  }
}

function startOfMonthsAgo(n: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
}
