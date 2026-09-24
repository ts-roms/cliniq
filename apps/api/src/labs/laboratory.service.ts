import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService, type PrismaClient } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  checkCapability,
  licenceStatus,
  type CapabilityEntry,
  type TestRef,
} from './capability.js';
import type {
  UpsertLaboratoryDto,
  SetCapabilityDto,
} from './dto/laboratory.dto.js';

/**
 * The licensed laboratory: its Licence to Operate, and what it may perform.
 *
 * DOH AO 2021-0037. A clinical laboratory may not perform examinations beyond
 * its authorized service capability, and its issued reports must carry the
 * LTO number and the head of laboratory.
 */
@Injectable()
export class LaboratoryService {
  private readonly logger = new Logger(LaboratoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The tenant's laboratory profile, with its licence status computed. */
  async get(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const lab = await tx.laboratory.findFirst({
        include: { capabilities: { orderBy: { createdAt: 'asc' } } },
      });
      if (!lab) return null;
      return { ...lab, licence: licenceStatus(lab, new Date()) };
    });
  }

  /**
   * Create or update the profile.
   *
   * Upsert on the tenant: there is one laboratory per tenant, and a second
   * row would leave two answers to "what is our LTO number".
   */
  async upsert(dto: UpsertLaboratoryDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      if (dto.validFrom && dto.validUntil && dto.validUntil < dto.validFrom) {
        throw new BadRequestException('validUntil is before validFrom');
      }
      const existing = await tx.laboratory.findFirst();
      const data = {
        name: dto.name,
        dohLtoNumber: dto.dohLtoNumber ?? null,
        category: dto.category,
        classification: dto.classification ?? null,
        validFrom: dto.validFrom ?? null,
        validUntil: dto.validUntil ?? null,
        headName: dto.headName ?? null,
        headLicenseNumber: dto.headLicenseNumber ?? null,
        pathologistName: dto.pathologistName ?? null,
        pathologistLicenseNumber: dto.pathologistLicenseNumber ?? null,
      };
      const lab = existing
        ? await tx.laboratory.update({ where: { id: existing.id }, data })
        : await tx.laboratory.create({
            data: { tenantId: user.tenantId, ...data },
          });
      return { ...lab, licence: licenceStatus(lab, new Date()) };
    });
  }

  /**
   * Declare (or withdraw) capability for a section or a single test.
   *
   * A row naming a test overrides one naming its section, so "we do
   * chemistry but HbA1c goes out" is expressible without turning off the
   * whole section.
   */
  async setCapability(dto: SetCapabilityDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const hasSection = Boolean(dto.sectionId);
      const hasTest = Boolean(dto.testId);
      if (hasSection === hasTest) {
        throw new BadRequestException(
          'name exactly one of sectionId or testId',
        );
      }
      const lab = await tx.laboratory.findFirst();
      if (!lab) {
        throw new BadRequestException(
          'record the laboratory profile before declaring what it can perform',
        );
      }

      const existing = await tx.labServiceCapability.findFirst({
        where: hasTest
          ? { laboratoryId: lab.id, testId: dto.testId }
          : { laboratoryId: lab.id, sectionId: dto.sectionId, testId: null },
      });
      if (existing) {
        return tx.labServiceCapability.update({
          where: { id: existing.id },
          data: {
            isEnabled: dto.isEnabled ?? true,
            referralLaboratoryId: dto.referralLaboratoryId ?? null,
          },
        });
      }
      return tx.labServiceCapability.create({
        data: {
          tenantId: user.tenantId,
          laboratoryId: lab.id,
          sectionId: dto.sectionId ?? null,
          testId: dto.testId ?? null,
          isEnabled: dto.isEnabled ?? true,
          referralLaboratoryId: dto.referralLaboratoryId ?? null,
        },
      });
    });
  }

  async removeCapability(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      await tx.labServiceCapability.deleteMany({ where: { id } });
    });
  }

  /**
   * Which of these tests fall outside the laboratory's declared capability.
   *
   * Returns an empty list when nothing is declared, so a clinic that has
   * never filled this in sees no change at all. Each entry carries the
   * standing referral destination from whichever capability row excluded the
   * test, when there is one; what the caller does with that — refer, flag or
   * refuse — is ./referral.ts's decision, not this one's.
   */
  async screen(
    tx: PrismaClient,
    tests: readonly TestRef[],
  ): Promise<
    Array<{
      ref: string;
      testId: string | null;
      testName: string;
      reason: string;
      referralLaboratoryId: string | null;
    }>
  > {
    const lab = await tx.laboratory.findFirst({
      include: { capabilities: true },
    });
    if (!lab || lab.capabilities.length === 0) return [];

    const declared: CapabilityEntry[] = lab.capabilities.map((c) => ({
      sectionId: c.sectionId,
      testId: c.testId,
      isEnabled: c.isEnabled,
    }));

    const out: Array<{
      ref: string;
      testId: string | null;
      testName: string;
      reason: string;
      referralLaboratoryId: string | null;
    }> = [];
    for (const test of tests) {
      const verdict = checkCapability(test, declared);
      if (verdict.status === 'OUT_OF_SCOPE') {
        // The standing send-out arrangement lives on whichever capability
        // row excluded this test — most specific first, same precedence the
        // check itself uses.
        const row =
          lab.capabilities.find((c) => c.testId === test.testId) ??
          lab.capabilities.find(
            (c) => c.testId === null && c.sectionId === test.sectionId,
          );
        out.push({
          ref: test.ref,
          testId: test.testId,
          testName: test.testName,
          reason: verdict.reason,
          referralLaboratoryId: row?.referralLaboratoryId ?? null,
        });
      }
    }
    if (out.length > 0) {
      this.logger.warn(
        `order contains ${out.length} test(s) outside declared capability: ${out
          .map((o) => o.testName)
          .join(', ')}`,
      );
    }
    return out;
  }
}
