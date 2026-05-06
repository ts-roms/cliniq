import { Injectable, Logger } from '@nestjs/common';
import {
  PrismaService,
  type NotificationKind,
  type NotificationSeverity,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { PushService } from './push.service.js';

export interface NotifyInput {
  tenantId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  entityId?: string;
  severity?: NotificationSeverity;
}

export interface NotifyManyInput extends Omit<NotifyInput, 'userId'> {
  userIds: string[];
}

/**
 * Global service. Other modules call notify() / notifyMany() / notifyRoles()
 * for async events. Never throws — notification delivery failure is not
 * allowed to break the calling business action (same contract as Mailer/Sms).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          kind: input.kind,
          severity: input.severity ?? 'INFO',
          title: input.title,
          body: input.body,
          link: input.link,
          entityId: input.entityId,
        },
      });
    } catch (err) {
      this.logger.error(`notify failed (${input.kind}): ${(err as Error).message}`);
      return; // don't push if the in-app row didn't even land
    }
    // Fire-and-forget push fan-out. PushService swallows its own errors and
    // no-ops when the user has no registered devices.
    void this.push.sendToUser(input.userId, {
      title: input.title,
      body: input.body,
      data: pushData(input),
    });
  }

  async notifyMany(input: NotifyManyInput): Promise<void> {
    if (input.userIds.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: input.userIds.map((userId) => ({
          tenantId: input.tenantId,
          userId,
          kind: input.kind,
          severity: input.severity ?? 'INFO',
          title: input.title,
          body: input.body,
          link: input.link,
          entityId: input.entityId,
        })),
      });
    } catch (err) {
      this.logger.error(`notifyMany failed (${input.kind}): ${(err as Error).message}`);
      return;
    }
    void this.push.sendToUsers(input.userIds, {
      title: input.title,
      body: input.body,
      data: pushData(input),
    });
  }

  /** Convenience: fan-out to all ACTIVE users in a tenant matching any of the given roles. */
  async notifyRoles(
    tenantId: string,
    roles: Array<'OWNER' | 'ADMIN' | 'DOCTOR' | 'NURSE' | 'RECEPTIONIST' | 'PATIENT'>,
    payload: Omit<NotifyInput, 'tenantId' | 'userId'>,
  ): Promise<void> {
    const members = await this.prisma.tenantUser.findMany({
      where: { tenantId, status: 'ACTIVE', role: { in: roles } },
      select: { userId: true },
    });
    await this.notifyMany({
      tenantId,
      userIds: members.map((m) => m.userId),
      ...payload,
    });
  }

  // ── Read API (used by NotificationsController) ────

  list(user: AuthenticatedUser, unreadOnly: boolean) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.notification.findMany({
        where: {
          userId: user.userId,
          ...(unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  unreadCount(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.notification.count({
        where: { userId: user.userId, readAt: null },
      }),
    );
  }

  async markRead(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      // Defensive — RLS prevents cross-tenant, but also enforce userId match.
      const updated = await tx.notification.updateMany({
        where: { id, userId: user.userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: updated.count };
    });
  }

  async markAllRead(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const updated = await tx.notification.updateMany({
        where: { userId: user.userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: updated.count };
    });
  }
}

/** Shape passed to the mobile client via Expo's data field. Stays small. */
function pushData(input: { kind: NotificationKind; link?: string; entityId?: string }) {
  return {
    kind: input.kind,
    ...(input.link ? { link: input.link } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
  };
}
