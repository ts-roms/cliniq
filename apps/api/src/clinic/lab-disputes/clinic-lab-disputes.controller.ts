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
import { LabCaseDisputeStatus } from '@org/db';
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabDisputesService } from '../../lab/disputes/lab-disputes.service.js';
import {
  DisputeMessageDto,
  OpenDisputeDto,
  ResolveDisputeDto,
} from '../../lab/disputes/dto/dispute.dto.js';

/**
 * Clinic-side disputes. No clinic-side feature gate — clinics get free
 * access to dispute their lab's deliveries. The lab side is gated by
 * LAB_DISPUTE_MANAGER (Premium).
 */
@ApiTags('clinic-lab-disputes')
@ApiBearerAuth('jwt')
@Controller('clinic/lab-disputes')
export class ClinicLabDisputesController {
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
    action: 'clinic.dispute.open',
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
    action: 'clinic.dispute.close',
    entity: 'LabCaseDispute',
    entityIdFrom: 'param:id',
  })
  close(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (dto.status === LabCaseDisputeStatus.OPEN) {
      throw new Error('cannot close to OPEN');
    }
    return this.disputes.close(id, dto.status, dto.notes ?? null, user);
  }
}
