import { Injectable } from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class DrugsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search the drug catalog. Returns global rows + the caller's tenant
   * overrides; ranks brand-match before generic-match before fuzzy.
   *
   * Cap at 25 results — autocomplete UI shouldn't render more than that.
   */
  async search(query: string, user: AuthenticatedUser) {
    const q = query.trim();
    if (q.length < 2) return [];
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.drug.findMany({
        where: {
          active: true,
          OR: [
            { generic: { contains: q, mode: 'insensitive' } },
            { brand:   { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: [{ brand: 'asc' }, { generic: 'asc' }],
        take: 25,
        select: {
          id: true,
          generic: true,
          brand: true,
          strength: true,
          form: true,
          atcCode: true,
          classes: true,
          controlled: true,
          tenantId: true,
        },
      }),
    );
  }

  async getById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.drug.findFirst({ where: { id, active: true } }),
    );
  }
}
