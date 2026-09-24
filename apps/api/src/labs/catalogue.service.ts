import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type {
  CreateLabSectionDto,
  CreateLaboratoryTestDto,
  UpdateLabSectionDto,
  UpdateLaboratoryTestDto,
} from './dto/catalogue.dto.js';

/**
 * The laboratory test catalogue.
 *
 * Nothing here is clinical judgement — it is the list of what the laboratory
 * offers and what each test reports. But it is the thing that makes results
 * answerable: with a catalogue, "every haemoglobin for this patient" is a
 * query; without one it is a string match against whatever was typed.
 */
@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Sections ───────────────────────────────────────

  listSections(user: AuthenticatedUser, includeInactive = false) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labSection.findMany({
        where: {
          deletedAt: null,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async createSection(dto: CreateLabSectionDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const clash = await tx.labSection.findFirst({
        where: { code: dto.code, deletedAt: null },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(`section ${dto.code} already exists`);
      }
      return tx.labSection.create({
        data: {
          tenantId: user.tenantId,
          code: dto.code,
          name: dto.name,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    });
  }

  async updateSection(
    id: string,
    dto: UpdateLabSectionDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labSection.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException(`Section ${id} not found`);
      return tx.labSection.update({ where: { id }, data: { ...dto } });
    });
  }

  // ── Tests ──────────────────────────────────────────

  listTests(
    user: AuthenticatedUser,
    opts: { sectionId?: string; includeInactive?: boolean } = {},
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.laboratoryTest.findMany({
        where: {
          deletedAt: null,
          ...(opts.sectionId ? { sectionId: opts.sectionId } : {}),
          ...(opts.includeInactive ? {} : { isActive: true }),
        },
        include: {
          components: {
            where: { deletedAt: null },
            orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
          },
          section: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ code: 'asc' }],
        take: 500,
      }),
    );
  }

  async getTest(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const test = await tx.laboratoryTest.findFirst({
        where: { id, deletedAt: null },
        include: {
          components: {
            where: { deletedAt: null },
            orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
          },
          section: { select: { id: true, code: true, name: true } },
        },
      });
      if (!test) throw new NotFoundException(`Test ${id} not found`);
      return test;
    });
  }

  async createTest(dto: CreateLaboratoryTestDto, user: AuthenticatedUser) {
    // A test that reports nothing cannot produce a result, so it is not a
    // test. Refused here rather than allowed and discovered at result entry.
    if (dto.components.length === 0) {
      throw new BadRequestException(
        'a test must report at least one component',
      );
    }
    const codes = dto.components.map((c) => c.code.toUpperCase());
    const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
    if (dupes.length > 0) {
      throw new BadRequestException(
        `duplicate component codes: ${[...new Set(dupes)].join(', ')}`,
      );
    }
    if (
      dto.statTatMinutes !== undefined &&
      dto.targetTatMinutes !== undefined &&
      dto.statTatMinutes > dto.targetTatMinutes
    ) {
      throw new BadRequestException(
        'statTatMinutes must not exceed targetTatMinutes',
      );
    }

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const section = await tx.labSection.findFirst({
        where: { id: dto.sectionId, deletedAt: null },
        select: { id: true },
      });
      if (!section) {
        throw new BadRequestException(
          `section ${dto.sectionId} not found in this tenant`,
        );
      }
      const clash = await tx.laboratoryTest.findFirst({
        where: { code: dto.code, deletedAt: null },
        select: { id: true },
      });
      if (clash) throw new ConflictException(`test ${dto.code} already exists`);

      return tx.laboratoryTest.create({
        data: {
          tenantId: user.tenantId,
          code: dto.code,
          loincCode: dto.loincCode ?? null,
          name: dto.name,
          shortName: dto.shortName ?? null,
          sectionId: dto.sectionId,
          // A panel is simply a test that reports more than one analyte —
          // derived rather than asked for, so the two cannot disagree.
          isPanel: dto.components.length > 1,
          specimenType: dto.specimenType ?? null,
          container: dto.container ?? null,
          minVolumeMl: dto.minVolumeMl ?? null,
          collectionInstructions: dto.collectionInstructions ?? null,
          processingInstructions: dto.processingInstructions ?? null,
          method: dto.method ?? null,
          targetTatMinutes: dto.targetTatMinutes ?? null,
          statTatMinutes: dto.statTatMinutes ?? null,
          components: {
            create: dto.components.map((c, i) => ({
              tenantId: user.tenantId,
              code: c.code,
              loincCode: c.loincCode ?? null,
              name: c.name,
              resultType: c.resultType ?? 'NUMERIC',
              unit: c.unit ?? null,
              decimals: c.decimals ?? 1,
              displayOrder: c.displayOrder ?? i,
            })),
          },
        },
        include: { components: { orderBy: { displayOrder: 'asc' } } },
      });
    });
  }

  async updateTest(
    id: string,
    dto: UpdateLaboratoryTestDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.laboratoryTest.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) throw new NotFoundException(`Test ${id} not found`);

      if (dto.sectionId) {
        const section = await tx.labSection.findFirst({
          where: { id: dto.sectionId, deletedAt: null },
          select: { id: true },
        });
        if (!section) {
          throw new BadRequestException(
            `section ${dto.sectionId} not found in this tenant`,
          );
        }
      }
      const stat = dto.statTatMinutes ?? existing.statTatMinutes;
      const target = dto.targetTatMinutes ?? existing.targetTatMinutes;
      if (stat !== null && target !== null && stat > target) {
        throw new BadRequestException(
          'statTatMinutes must not exceed targetTatMinutes',
        );
      }

      return tx.laboratoryTest.update({
        where: { id },
        data: { ...dto },
        include: { components: { orderBy: { displayOrder: 'asc' } } },
      });
    });
  }

  /**
   * Retire a test.
   *
   * Soft delete AND deactivate: a catalogue entry is the explanation for how
   * an order was placed, so it stays readable. Orders already placed keep
   * their snapshotted name and code regardless — the FK is ON DELETE SET
   * NULL, so even a hard delete would not take a historical order with it.
   */
  async retireTest(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.laboratoryTest.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException(`Test ${id} not found`);
      return tx.laboratoryTest.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });
    });
  }
}
