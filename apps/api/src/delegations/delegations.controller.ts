import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audit } from '../audit/audit.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { DelegationsService } from './delegations.service.js';
import { CreateDelegationDto } from './dto/delegation.dto.js';

@ApiTags('delegations')
@ApiBearerAuth('jwt')
@Controller('delegations')
export class DelegationsController {
  constructor(private readonly delegations: DelegationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'delegation.create', entity: 'Delegation', entityIdFrom: 'result:id' })
  create(@Body() dto: CreateDelegationDto, @CurrentUser() u: AuthenticatedUser) {
    return this.delegations.create(dto, u);
  }

  @Get('granted')
  listGranted(@CurrentUser() u: AuthenticatedUser) {
    return this.delegations.listGranted(u);
  }

  @Get('received-active')
  listReceivedActive(@CurrentUser() u: AuthenticatedUser) {
    return this.delegations.listReceivedActive(u);
  }

  @Get('eligible-delegatees')
  listEligibleDelegatees(@CurrentUser() u: AuthenticatedUser) {
    return this.delegations.listEligibleDelegatees(u);
  }

  @Patch(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'delegation.revoke', entity: 'Delegation', entityIdFrom: 'param:id' })
  revoke(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.delegations.revoke(id, u);
  }
}
