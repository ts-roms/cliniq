import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { NotificationKind, NotificationSeverity } from '@org/db';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';
import { BroadcastDto } from './dto/broadcast.dto.js';

const STAFF_ROLES = ['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] as const;

@ApiTags('notifications')
@ApiBearerAuth('jwt')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notif: NotificationsService) {}

  @Get()
  @ApiQuery({ name: 'unread', required: false, type: String })
  list(
    @Query('unread') unread: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notif.list(user, unread === 'true');
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notif.unreadCount(user);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notif.markRead(id, user);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notif.markAllRead(user);
  }

  /**
   * Broadcast a `GENERAL` notification to all staff (or a role-filtered
   * subset). TENANT_MANAGE-gated to keep this from being a spam vector;
   * audit-logged so abuse is traceable.
   */
  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'notification.broadcast', entity: 'Notification' })
  async broadcast(@Body() dto: BroadcastDto, @CurrentUser() user: AuthenticatedUser) {
    const roles = dto.roles && dto.roles.length > 0 ? dto.roles : [...STAFF_ROLES];
    await this.notif.notifyRoles(user.tenantId, roles, {
      kind: NotificationKind.GENERAL,
      severity: dto.severity ?? NotificationSeverity.INFO,
      title: dto.title,
      body: dto.body,
      link: dto.link,
    });
    return { ok: true, roles };
  }
}
