import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, type PrismaClient } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  calibrationStatus,
  fitnessForTesting,
  reagentLotStatus,
  type Fitness,
} from './fitness.js';
import type {
  RecordCalibrationDto,
  UpsertEquipmentDto,
  UpsertReagentLotDto,
} from './dto/equipment.dto.js';

/**
 * Equipment, calibration and reagent lots.
 *
 * The point is traceability: which instrument and which reagent lot produced
 * a given result. When a lot is recalled, that link turns "which results are
 * affected" from an unanswerable question into a query — see
 * `resultsFromLot`.
 *
 * The fitness checks exist so the link is worth having. Knowing which lot
 * produced a result matters most when the lot turns out to have been unfit.
 */
@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── equipment ─────────────────────────────────────

  async listEquipment(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rows = await tx.equipment.findMany({
        where: { deletedAt: null },
        include: {
          calibrations: { orderBy: { calibratedAt: 'desc' }, take: 1 },
        },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      });
      const now = new Date();
      return rows.map((e) => ({
        ...e,
        calibration: calibrationStatus(
          {
            calibratedAt: e.calibrations[0]?.calibratedAt ?? null,
            intervalDays: e.calibrationIntervalDays,
          },
          now,
        ),
      }));
    });
  }

  async upsertEquipment(dto: UpsertEquipmentDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.equipment.findFirst({
        where: { name: dto.name, deletedAt: null },
      });
      const data = {
        name: dto.name,
        manufacturer: dto.manufacturer ?? null,
        model: dto.model ?? null,
        serialNumber: dto.serialNumber ?? null,
        location: dto.location ?? null,
        status: dto.status,
        calibrationIntervalDays: dto.calibrationIntervalDays ?? null,
        commissionedOn: dto.commissionedOn ?? null,
      };
      return existing
        ? tx.equipment.update({ where: { id: existing.id }, data })
        : tx.equipment.create({ data: { tenantId: user.tenantId, ...data } });
    });
  }

  /** Record a calibration. Append-only — there is no edit. */
  async recordCalibration(dto: RecordCalibrationDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const equipment = await tx.equipment.findFirst({
        where: { id: dto.equipmentId, deletedAt: null },
      });
      if (!equipment) {
        throw new NotFoundException(`Equipment ${dto.equipmentId} not found`);
      }
      return tx.calibration.create({
        data: {
          tenantId: user.tenantId,
          equipmentId: dto.equipmentId,
          testId: dto.testId ?? null,
          calibratedAt: dto.calibratedAt ?? new Date(),
          performedById: user.userId,
          calibratorLot: dto.calibratorLot ?? null,
          passed: dto.passed ?? true,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  listCalibrations(equipmentId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.calibration.findMany({
        where: { equipmentId },
        orderBy: { calibratedAt: 'desc' },
        take: 100,
      }),
    );
  }

  // ── reagent lots ──────────────────────────────────

  async listReagentLots(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rows = await tx.reagentLot.findMany({
        where: { deletedAt: null },
        include: { equipment: { select: { name: true } } },
        orderBy: [{ isActive: 'desc' }, { expiresOn: 'asc' }],
      });
      const now = new Date();
      return rows.map((r) => ({ ...r, status: reagentLotStatus(r, now) }));
    });
  }

  async upsertReagentLot(dto: UpsertReagentLotDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      if (dto.openedOn && dto.receivedOn && dto.openedOn < dto.receivedOn) {
        throw new BadRequestException(
          'a vial cannot be opened before it arrived',
        );
      }
      const existing = await tx.reagentLot.findFirst({
        where: { name: dto.name, lotNumber: dto.lotNumber, deletedAt: null },
      });
      const data = {
        name: dto.name,
        lotNumber: dto.lotNumber,
        manufacturer: dto.manufacturer ?? null,
        expiresOn: dto.expiresOn ?? null,
        openedOn: dto.openedOn ?? null,
        openStabilityDays: dto.openStabilityDays ?? null,
        receivedOn: dto.receivedOn ?? null,
        equipmentId: dto.equipmentId ?? null,
        isActive: dto.isActive ?? true,
      };
      return existing
        ? tx.reagentLot.update({ where: { id: existing.id }, data })
        : tx.reagentLot.create({ data: { tenantId: user.tenantId, ...data } });
    });
  }

  /**
   * Every result a given lot produced.
   *
   * This is the recall query, and the reason the traceability columns exist.
   * Returns the order, the patient and the test so the laboratory can work
   * out who needs re-testing and who needs telling.
   */
  async resultsFromLot(reagentLotId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const lot = await tx.reagentLot.findFirst({
        where: { id: reagentLotId },
      });
      if (!lot) {
        throw new NotFoundException(`Reagent lot ${reagentLotId} not found`);
      }
      const items = await tx.labOrderItem.findMany({
        where: { reagentLotId },
        select: {
          id: true,
          testName: true,
          testCode: true,
          resultValue: true,
          resultStatus: true,
          reportedAt: true,
          order: {
            select: { id: true, number: true, patientId: true },
          },
        },
        orderBy: { reportedAt: 'desc' },
        take: 1000,
      });
      return { lot: { name: lot.name, lotNumber: lot.lotNumber }, items };
    });
  }

  /**
   * Is this equipment and lot fit to produce a result right now?
   *
   * Called from the result-entry path. Returns `ok` with no warnings when
   * nothing is recorded, so a laboratory that has not catalogued its
   * instruments is unaffected.
   */
  async checkFitness(
    tx: PrismaClient,
    equipmentId: string | null,
    reagentLotId: string | null,
    at: Date = new Date(),
  ): Promise<Fitness> {
    const equipment = equipmentId
      ? await tx.equipment.findFirst({
          where: { id: equipmentId, deletedAt: null },
          include: {
            calibrations: { orderBy: { calibratedAt: 'desc' }, take: 1 },
          },
        })
      : null;
    const lot = reagentLotId
      ? await tx.reagentLot.findFirst({
          where: { id: reagentLotId, deletedAt: null },
        })
      : null;

    return fitnessForTesting({
      equipment: equipment
        ? { status: equipment.status, name: equipment.name }
        : null,
      calibration: equipment
        ? calibrationStatus(
            {
              calibratedAt: equipment.calibrations[0]?.calibratedAt ?? null,
              intervalDays: equipment.calibrationIntervalDays,
            },
            at,
          )
        : null,
      reagentLot: lot ? { name: lot.name, lotNumber: lot.lotNumber } : null,
      reagentStatus: lot ? reagentLotStatus(lot, at) : null,
    });
  }
}
