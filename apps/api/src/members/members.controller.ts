import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { AUTH_THROTTLE } from '../common/throttle.config.js';
import { MembersService } from './members.service.js';
import {
  ChangeRoleDto,
  ChangeStatusDto,
  CreateInviteDto,
} from './dto/members.dto.js';

@ApiTags('members')
@ApiBearerAuth('jwt')
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  // ── Invites ─────────────────────────────────────────────────────
  // Declared before the `:id` routes so `invites` isn't captured as an id.

  /** Public: what the accept page shows before the invitee picks a password. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Get('invites/preview')
  previewInvite(@Query('token') token?: string) {
    return this.members.previewInvite(token ?? '');
  }

  @Get('invites')
  @Requires(Actions.USER_INVITE)
  listInvites(@CurrentUser() u: AuthenticatedUser) {
    return this.members.listInvites(u);
  }

  @Post('invites')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.USER_INVITE)
  @Audit({
    action: 'member.invite',
    entity: 'TenantInvite',
    entityIdFrom: 'result:id',
  })
  createInvite(
    @Body() dto: CreateInviteDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.members.createInvite(dto, u);
  }

  @Post('invites/:id/resend')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.USER_INVITE)
  @Audit({
    action: 'member.inviteResend',
    entity: 'TenantInvite',
    entityIdFrom: 'param:id',
  })
  resendInvite(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.members.resendInvite(id, u);
  }

  @Delete('invites/:id')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.USER_INVITE)
  @Audit({
    action: 'member.inviteRevoke',
    entity: 'TenantInvite',
    entityIdFrom: 'param:id',
  })
  revokeInvite(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.members.revokeInvite(id, u);
  }

  // ── Members ─────────────────────────────────────────────────────

  @Get()
  @Requires(Actions.USER_INVITE)
  list(@CurrentUser() u: AuthenticatedUser) {
    return this.members.list(u);
  }

  @Patch(':id/role')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.USER_MANAGE)
  @Audit({
    action: 'member.roleChange',
    entity: 'TenantUser',
    entityIdFrom: 'param:id',
  })
  changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.members.changeRole(id, dto, u);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.USER_MANAGE)
  @Audit({
    action: 'member.statusChange',
    entity: 'TenantUser',
    entityIdFrom: 'param:id',
  })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.members.changeStatus(id, dto, u);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.USER_MANAGE)
  @Audit({
    action: 'member.remove',
    entity: 'TenantUser',
    entityIdFrom: 'param:id',
  })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.members.remove(id, u);
  }
}
