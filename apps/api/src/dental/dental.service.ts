import { Injectable, NotFoundException } from '@nestjs/common';
import { Dentition, PrismaService, ToothStatus } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { UpsertDentalChartDto } from './dto/dental.dto.js';

@Injectable()
export class DentalService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPatient(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const p = await tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
      });
      if (!p) throw new NotFoundException(`Patient ${patientId} not found`);
    });
  }

  /** Latest non-deleted chart for a patient, with all teeth + surfaces. */
  async getLatestForPatient(patientId: string, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.dentalChart.findFirst({
        where: { patientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          teeth: { include: { surfaces: true }, orderBy: { toothCode: 'asc' } },
        },
      }),
    );
  }

  /** Full history for the patient (chart heads only — no teeth). */
  async listForPatient(patientId: string, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.dentalChart.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          dentition: true,
          notes: true,
          consultationId: true,
        },
      }),
    );
  }

  async getById(chartId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const chart = await tx.dentalChart.findFirst({
        where: { id: chartId, deletedAt: null },
        include: {
          teeth: { include: { surfaces: true }, orderBy: { toothCode: 'asc' } },
        },
      });
      if (!chart) throw new NotFoundException(`Dental chart ${chartId} not found`);
      return chart;
    });
  }

  /**
   * Replace-style upsert: every call creates a NEW chart row (versioned snapshot).
   * Keeps history intact instead of mutating in place. The "current chart" for a
   * patient is just the most-recent row.
   */
  async upsertForPatient(
    patientId: string,
    dto: UpsertDentalChartDto,
    user: AuthenticatedUser,
  ) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const chart = await tx.dentalChart.create({
        data: {
          tenantId: user.tenantId,
          patientId,
          consultationId: dto.consultationId ?? null,
          dentition: dto.dentition ?? Dentition.ADULT,
          notes: dto.notes ?? null,
          teeth: {
            create: dto.teeth.map((t) => ({
              tenantId: user.tenantId,
              toothCode: t.toothCode,
              status: t.status ?? ToothStatus.PRESENT,
              notes: t.notes ?? null,
              surfaces: t.surfaces?.length
                ? {
                    create: t.surfaces.map((s) => ({
                      tenantId: user.tenantId,
                      surface: s.surface,
                      finding: s.finding,
                      notes: s.notes ?? null,
                    })),
                  }
                : undefined,
            })),
          },
        },
        include: {
          teeth: { include: { surfaces: true }, orderBy: { toothCode: 'asc' } },
        },
      });
      return chart;
    });
  }

  async softDelete(chartId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const chart = await tx.dentalChart.findFirst({
        where: { id: chartId, deletedAt: null },
        select: { id: true },
      });
      if (!chart) throw new NotFoundException(`Dental chart ${chartId} not found`);
      await tx.dentalChart.update({
        where: { id: chartId },
        data: { deletedAt: new Date() },
      });
    });
  }
}
