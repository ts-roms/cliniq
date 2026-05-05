import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ConsentTypeDto, type SetConsentDto } from './dto/set-consent.dto.js';

@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForPatient(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException(`Patient ${patientId} not found`);
      const rows = await tx.patientConsent.findMany({
        where: { patientId },
        orderBy: { type: 'asc' },
      });
      return rows;
    });
  }

  async set(
    patientId: string,
    dto: SetConsentDto,
    user: AuthenticatedUser,
    req?: Request,
  ) {
    if (!dto.granted && dto.type !== ConsentTypeDto.TREATMENT && !dto.withdrawalReason) {
      throw new BadRequestException('withdrawalReason is required when revoking consent');
    }
    if (!dto.granted && dto.type === ConsentTypeDto.TREATMENT) {
      throw new BadRequestException(
        'Treatment consent cannot be withdrawn while the patient has active records — soft-delete the patient instead',
      );
    }

    const ip =
      (req?.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req?.ip ?? null;
    const now = new Date();

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException(`Patient ${patientId} not found`);

      const result = await tx.patientConsent.upsert({
        where: {
          tenantId_patientId_type: {
            tenantId: user.tenantId,
            patientId,
            type: dto.type as never,
          },
        },
        create: {
          tenantId: user.tenantId,
          patientId,
          type: dto.type as never,
          granted: dto.granted,
          version: dto.version ?? 'v1',
          acceptedAt: dto.granted ? now : null,
          withdrawnAt: dto.granted ? null : now,
          withdrawalReason: dto.granted ? null : dto.withdrawalReason ?? null,
          recordedBy: user.userId,
          ip,
        },
        update: {
          granted: dto.granted,
          version: dto.version ?? 'v1',
          acceptedAt: dto.granted ? now : undefined,
          withdrawnAt: dto.granted ? null : now,
          withdrawalReason: dto.granted ? null : dto.withdrawalReason ?? null,
          recordedBy: user.userId,
          ip,
        },
      });

      this.logger.log(
        `consent ${dto.type} for patient ${patientId} -> granted=${dto.granted} by ${user.userId}`,
      );
      return result;
    });
  }

  /**
   * Pure read used by other services (e.g. ConsultationsService.generateSoapDraft)
   * to enforce AI_PROCESSING opt-out. Resolves to true only when an active
   * row exists with `granted=true` and no `withdrawnAt`.
   */
  async hasGranted(
    patientId: string,
    type: ConsentTypeDto,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const row = await tx.patientConsent.findUnique({
        where: {
          tenantId_patientId_type: {
            tenantId: user.tenantId,
            patientId,
            type: type as never,
          },
        },
      });
      return !!row && row.granted && !row.withdrawnAt;
    });
  }
}
