import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { LabCaseDisputeStatus } from '@org/db';
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabDisputesService } from './lab-disputes.service.js';
import {
  DisputeMessageDto,
  OpenDisputeDto,
  ResolveDisputeDto,
} from './dto/dispute.dto.js';

/**
 * Lab-side disputes. Mounted at /api/lab/disputes. Gated by
 * LAB_DISPUTE_MANAGER (Premium). The clinic side is in clinic/lab-disputes
 * and uses the same service — no clinic feature gate.
 */
@ApiTags('lab-disputes')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_DISPUTE_MANAGER)
@Controller('lab/disputes')
export class LabDisputesController {
  constructor(private readonly disputes: LabDisputesService) {}

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('caseId') caseId: string,
  ) {
    return this.disputes.listForCase(caseId, user);
  }

  @Get(':id')
  @Requires(Actions.TENANT_MANAGE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.disputes.findById(id, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.dispute.open',
    entity: 'LabCaseDispute',
    entityIdFrom: 'result:id',
  })
  open(@Body() dto: OpenDisputeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.disputes.open(dto.caseId, dto.kind, dto.reason, user);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  postMessage(
    @Param('id') id: string,
    @Body() dto: DisputeMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.disputes.addMessage(id, dto.body, user);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.dispute.close',
    entity: 'LabCaseDispute',
    entityIdFrom: 'param:id',
  })
  close(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (
      dto.status === LabCaseDisputeStatus.OPEN
    ) {
      throw new Error('cannot close to OPEN');
    }
    return this.disputes.close(id, dto.status, dto.notes ?? null, user);
  }
}
