import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { PrismaService } from '@org/db';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { AuditFilterDto } from './dto/audit-filter.dto.js';

@ApiTags('audit')
@ApiBearerAuth('jwt')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Requires(Actions.AUDIT_READ)
  async list(@Query() filter: AuditFilterDto, @CurrentUser() user: AuthenticatedUser) {
    const limit = filter.limit ?? 50;
    const offset = filter.cursor ?? 0;

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const where = {
        tenantId: user.tenantId,
        ...(filter.action ? { action: { startsWith: filter.action } } : {}),
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.since || filter.until
          ? {
              occurredAt: {
                ...(filter.since ? { gte: new Date(filter.since) } : {}),
                ...(filter.until ? { lte: new Date(filter.until) } : {}),
              },
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        tx.auditLog.count({ where }),
      ]);

      return {
        items,
        total,
        limit,
        cursor: offset,
        nextCursor: offset + items.length < total ? offset + items.length : null,
      };
    });
  }
}
