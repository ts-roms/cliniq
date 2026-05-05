import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DsrStatus,
  NotificationKind,
  NotificationSeverity,
  PrismaService,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { FileDsrDto, ResolveDsrDto } from './dto/dsr.dto.js';

@Injectable()
export class DsrService {
  private readonly logger = new Logger(DsrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
  ) {}

  async file(dto: FileDsrDto, user: AuthenticatedUser) {
    const row = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);
      const created = await tx.dataSubjectRequest.create({
        data: {
          tenantId: user.tenantId,
          patientId: patient.id,
          type: dto.type,
          status: DsrStatus.OPEN,
          details: dto.details,
          filedBy: user.userId,
        },
      });
      this.logger.log(
        `DSR ${dto.type} filed for patient ${patient.id} by ${user.userId}`,
      );
      return created;
    });

    // Fan-out to DPO-class roles. PH DPA Sec 16 requires acknowledgement
    // within a reasonable window; an in-app notification is the fastest
    // signal we can give them without spamming email.
    void this.notif.notifyRoles(user.tenantId, ['OWNER', 'ADMIN'], {
      kind: NotificationKind.DSR_FILED,
      severity: NotificationSeverity.WARNING,
      title: `New ${row.type} request`,
      body: row.details ?? 'Patient filed a Data Privacy Act request',
      link: `/admin/dsr`,
      entityId: row.id,
    });
    return row;
  }

  async list(user: AuthenticatedUser, status?: DsrStatus) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.dataSubjectRequest.findMany({
        where: { ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  async resolve(id: string, dto: ResolveDsrDto, user: AuthenticatedUser) {
    const updated = await this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.dataSubjectRequest.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`DSR ${id} not found`);
      return tx.dataSubjectRequest.update({
        where: { id },
        data: {
          status: dto.status,
          resolution: dto.resolution,
          resolvedBy: user.userId,
          resolvedAt: dto.status === DsrStatus.OPEN ? null : new Date(),
        },
      });
    });

    // Notify the original filer (often a staff member acting on the patient's
    // behalf) when their request reaches a terminal state. Only fire on
    // RESOLVED/REJECTED — IN_PROGRESS isn't notable enough.
    if (
      updated.filedBy &&
      updated.filedBy !== user.userId &&
      (dto.status === DsrStatus.RESOLVED || dto.status === DsrStatus.REJECTED)
    ) {
      void this.notif.notify({
        tenantId: user.tenantId,
        userId: updated.filedBy,
        kind: NotificationKind.DSR_RESOLVED,
        severity: NotificationSeverity.INFO,
        title: `DSR ${updated.type} ${dto.status.toLowerCase()}`,
        body: dto.resolution ?? undefined,
        link: `/admin/dsr`,
        entityId: updated.id,
      });
    }
    return updated;
  }
}
