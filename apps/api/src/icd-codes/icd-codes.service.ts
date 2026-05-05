import { Injectable } from '@nestjs/common';
import { PrismaService } from '@org/db';

@Injectable()
export class IcdCodesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ICD-10 search. The catalog is global (tenantId-less, public knowledge),
   * so no withTenant needed. Matches on code prefix OR description ILIKE.
   *
   * Caps at 25 results. Empty query returns []. Description matches use the
   * pg_trgm GIN index from the migration, so a length-2 query is OK.
   */
  async search(query: string) {
    const q = query.trim();
    if (q.length < 2) return [];
    return this.prisma.icdCode.findMany({
      where: {
        OR: [
          { code:        { startsWith: q.toUpperCase() } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ billable: 'desc' }, { code: 'asc' }],
      take: 25,
    });
  }

  /**
   * Validate a list of codes — returns the subset that don't exist. UI uses
   * this to surface malformed codes before saving a consultation diagnosis.
   */
  async findUnknown(codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const found = await this.prisma.icdCode.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const known = new Set(found.map((r) => r.code));
    return codes.filter((c) => !known.has(c));
  }
}
