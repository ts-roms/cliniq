import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type {
  CreateAllergyDto,
  CreateConditionDto,
  CreateMedicationDto,
  CreateVitalDto,
} from './dto/clinical.dto.js';

@Injectable()
export class ClinicalService {
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

  // ── Allergies ─────────────────────────────────────
  async listAllergies(patientId: string, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.allergy.findMany({ where: { patientId }, orderBy: { notedAt: 'desc' } }),
    );
  }
  async addAllergy(patientId: string, dto: CreateAllergyDto, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.allergy.create({ data: { tenantId: user.tenantId, patientId, ...dto } }),
    );
  }
  async removeAllergy(patientId: string, id: string, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.allergy.delete({ where: { id } }),
    );
  }

  // ── Medications ──────────────────────────────────
  async listMedications(patientId: string, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.medication.findMany({
        where: { patientId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  }
  async addMedication(patientId: string, dto: CreateMedicationDto, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.medication.create({ data: { tenantId: user.tenantId, patientId, ...dto } }),
    );
  }

  // ── Conditions ───────────────────────────────────
  async listConditions(patientId: string, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.condition.findMany({
        where: { patientId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
    );
  }
  async addCondition(patientId: string, dto: CreateConditionDto, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.condition.create({ data: { tenantId: user.tenantId, patientId, ...dto } }),
    );
  }

  // ── Vitals ───────────────────────────────────────
  async listVitals(patientId: string, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.vital.findMany({ where: { patientId }, orderBy: { measuredAt: 'desc' }, take: 50 }),
    );
  }
  async addVital(patientId: string, dto: CreateVitalDto, user: AuthenticatedUser) {
    await this.assertPatient(patientId, user);
    const bmi =
      dto.weightKg && dto.heightCm
        ? round2(dto.weightKg / Math.pow(dto.heightCm / 100, 2))
        : undefined;
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.vital.create({
        data: {
          tenantId: user.tenantId,
          patientId,
          consultationId: dto.consultationId ?? null,
          systolic: dto.systolic,
          diastolic: dto.diastolic,
          heartRate: dto.heartRate,
          respRate: dto.respRate,
          tempC: dto.tempC,
          spo2: dto.spo2,
          weightKg: dto.weightKg,
          heightCm: dto.heightCm,
          bmi,
          painScore: dto.painScore,
        },
      }),
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
