import { Injectable } from '@nestjs/common';
import { PrismaService } from '@org/db';

/**
 * Resolves the *other* tenant on a lab <-> clinic relationship.
 *
 * Why this exists
 * ---------------
 * Every cross-tenant read in the lab module asks Prisma for the counterparty
 * inline — `include: { lab: {...} }` on a LabClinicLink / LabCase /
 * LabInvoice, and `clinic: {...}` on the mirror routes. All of them silently
 * returned `null`: the join is evaluated under the caller's RLS context, and
 * `tenants_self_read` is `USING ("id" = current_tenant_id())`, so the
 * counterparty's `tenants` row is invisible. Proven in psql — the link row
 * comes back, the LEFT JOIN to `tenants` yields NULL.
 *
 * User-visible effect: the clinic's partnerships page rendered "Unknown lab"
 * for every lab, the lab's clinics page rendered "—" for every clinic, case
 * and invoice lists had an empty counterparty column, and generated invoice
 * PDFs carried neither the lab's nor the clinic's name.
 *
 * Why not widen the RLS policy
 * ----------------------------
 * A row-level policy is all-or-nothing on the row, and `tenants` carries
 * `settings` (the outbound webhook URL, tax config, branding), `plan`,
 * `status` and `trialEndsAt`. Letting a linked partner read that row would
 * hand them commercial and configuration data to fix a display bug.
 *
 * So the counterparty is resolved here instead: one batched read under
 * platform context, with an explicit column whitelist. The authorization
 * argument is that the ids only ever come from rows the caller's own RLS
 * context already returned — possessing a link/case/invoice row is proof of
 * the relationship. Nothing outside PUBLIC_COLUMNS is ever selected.
 */
export interface TenantProfile {
  id: string;
  slug: string;
  name: string;
  kind: string;
  type: string | null;
  labSpecialty: string | null;
}

/** The only `tenants` columns a counterparty is ever allowed to see. */
const PUBLIC_COLUMNS = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  type: true,
  labSpecialty: true,
} as const;

/** A row carrying either side of a lab<->clinic relationship. */
interface Linked {
  labTenantId?: string | null;
  clinicTenantId?: string | null;
  lab?: unknown;
  clinic?: unknown;
}

@Injectable()
export class LabCounterpartyService {
  constructor(private readonly prisma: PrismaService) {}

  async profiles(ids: string[]): Promise<Map<string, TenantProfile>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.withPlatformContext((tx) =>
      tx.tenant.findMany({
        where: { id: { in: unique } },
        select: PUBLIC_COLUMNS,
      }),
    );
    return new Map(rows.map((r) => [r.id, r as TenantProfile]));
  }

  /**
   * Fill in `lab` / `clinic` on rows that asked for them and got null.
   *
   * Only ever *adds* — a row whose relation Prisma did populate (the
   * caller's own tenant, which RLS does expose) is left alone, and a row
   * that never requested the relation is untouched.
   */
  async hydrate<T extends Linked>(row: T): Promise<T>;
  async hydrate<T extends Linked>(rows: T[]): Promise<T[]>;
  async hydrate<T extends Linked>(input: T | T[]): Promise<T | T[]> {
    const rows = Array.isArray(input) ? input : [input];
    const wanted: string[] = [];
    for (const row of rows) {
      if (row.lab === null && row.labTenantId) wanted.push(row.labTenantId);
      if (row.clinic === null && row.clinicTenantId) {
        wanted.push(row.clinicTenantId);
      }
    }
    if (wanted.length === 0) return input;

    const byId = await this.profiles(wanted);
    for (const row of rows) {
      if (row.lab === null && row.labTenantId) {
        row.lab = byId.get(row.labTenantId) ?? null;
      }
      if (row.clinic === null && row.clinicTenantId) {
        row.clinic = byId.get(row.clinicTenantId) ?? null;
      }
    }
    return input;
  }
}
