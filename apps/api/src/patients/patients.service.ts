import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import { ClinicModules, type ClinicModule } from '@org/shared-types';
import type { CreatePatientDto } from './dto/create-patient.dto.js';
import type { UpdatePatientDto } from './dto/update-patient.dto.js';
import type { PatientFilterDto } from './dto/patient-filter.dto.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Which specialty modules actually hold records for this patient.
   *
   * The chart hides modules the clinic does not practise, but a module that
   * is switched off can still hold real clinical history — a general clinic
   * that later narrows its configuration does not stop having charted teeth.
   * Hiding that data is the failure mode that hurts someone, so the chart
   * keeps rendering any module this returns true for, flagged as outside the
   * clinic's configured scope.
   *
   * One request instead of the client firing five module queries and
   * throwing four of them away.
   */
  async moduleData(
    patientId: string,
    user: AuthenticatedUser,
  ): Promise<Record<ClinicModule, boolean>> {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('patient not found');

      // Written out per model rather than sharing one `where` object:
      // HmoMembership is the one model here that is not soft-deletable, and a
      // shared `as const` literal widens enough that Prisma's per-model types
      // stop rejecting `deletedAt` on it (it only failed at runtime).
      const live = { deletedAt: null };
      const [dental, ob, ultrasound, labOrders, hmo] = await Promise.all([
        tx.dentalChart.count({ where: { patientId, ...live }, take: 1 }),
        tx.obPregnancy.count({ where: { patientId, ...live }, take: 1 }),
        tx.ultrasoundReport.count({ where: { patientId, ...live }, take: 1 }),
        tx.labOrder.count({ where: { patientId, ...live }, take: 1 }),
        tx.hmoMembership.count({ where: { patientId }, take: 1 }),
      ]);

      return {
        [ClinicModules.DENTAL]: dental > 0,
        [ClinicModules.OB]: ob > 0,
        [ClinicModules.ULTRASOUND]: ultrasound > 0,
        [ClinicModules.LAB_ORDERS]: labOrders > 0,
        [ClinicModules.HMO]: hmo > 0,
      };
    });
  }

  async create(dto: CreatePatientDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.patient.findUnique({
        where: { tenantId_mrn: { tenantId: user.tenantId, mrn: dto.mrn } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          `MRN ${dto.mrn} already exists in this clinic`,
        );
      }
      // `createdBy` isn't a column on Patient — actor identity for creates
      // lives in the AuditLog table via the @Audit interceptor on the
      // controller. Drop it from the payload to satisfy Prisma.
      const patient = await tx.patient.create({
        data: { ...dto, tenantId: user.tenantId },
      });
      this.logger.log(
        `Patient ${patient.id} (${patient.mrn}) created by ${user.userId}`,
      );
      return patient;
    });
  }

  async list(filter: PatientFilterDto, user: AuthenticatedUser) {
    const limit = filter.limit ?? 25;
    const offset = filter.cursor ?? 0;
    const q = filter.q?.trim();

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const where = q
        ? {
            deletedAt: null,
            OR: [
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
              { mrn: { contains: q } },
            ],
          }
        : { deletedAt: null };

      const [items, total] = await Promise.all([
        tx.patient.findMany({
          where,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          skip: offset,
          take: limit,
        }),
        tx.patient.count({ where }),
      ]);

      return {
        items,
        total,
        limit,
        cursor: offset,
        nextCursor:
          offset + items.length < total ? offset + items.length : null,
      };
    });
  }

  async findById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id, deletedAt: null },
      });
      if (!patient) throw new NotFoundException(`Patient ${id} not found`);
      return patient;
    });
  }

  async update(id: string, dto: UpdatePatientDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.patient.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, mrn: true },
      });
      if (!existing) throw new NotFoundException(`Patient ${id} not found`);

      if (dto.mrn && dto.mrn !== existing.mrn) {
        const collision = await tx.patient.findUnique({
          where: { tenantId_mrn: { tenantId: user.tenantId, mrn: dto.mrn } },
          select: { id: true },
        });
        if (collision && collision.id !== id) {
          throw new ConflictException(
            `MRN ${dto.mrn} already exists in this clinic`,
          );
        }
      }

      return tx.patient.update({ where: { id }, data: dto });
    });
  }

  /**
   * DPA Sec 16 right-of-access bundle. Returns everything tied to a patient:
   * demographics, all consults (with assessments + AI suggestions), all
   * prescriptions, files in the tenant, and the audit trail filtered to that
   * patient.
   *
   * Goes through `withTenant` so cross-tenant requests get nothing back.
   */
  async exportRecord(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id, deletedAt: null },
      });
      if (!patient) throw new NotFoundException(`Patient ${id} not found`);

      const [consultations, prescriptions, files, auditTrail] =
        await Promise.all([
          tx.consultation.findMany({
            where: { patientId: id, deletedAt: null },
            include: { suggestions: { orderBy: { createdAt: 'asc' } } },
            orderBy: { startedAt: 'desc' },
          }),
          tx.prescription.findMany({
            where: { patientId: id, deletedAt: null },
            include: { items: true },
            orderBy: { issuedAt: 'desc' },
          }),
          tx.fileObject.findMany({
            where: { tenantId: user.tenantId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
          }),
          tx.auditLog.findMany({
            where: {
              tenantId: user.tenantId,
              entityType: 'Patient',
              entityId: id,
            },
            orderBy: { occurredAt: 'desc' },
            take: 1000,
          }),
        ]);

      return {
        exportedAt: new Date().toISOString(),
        exportedBy: { userId: user.userId, email: user.email, role: user.role },
        tenantId: user.tenantId,
        patient,
        consultations,
        prescriptions,
        files,
        auditTrail,
      };
    });
  }

  async softDelete(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.patient.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException(`Patient ${id} not found`);

      await tx.patient.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      this.logger.log(`Patient ${id} soft-deleted by ${user.userId}`);
      return { ok: true };
    });
  }
}
