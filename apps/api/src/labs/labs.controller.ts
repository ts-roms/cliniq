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
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { LabsService } from './labs.service.js';
import {
  AmendResultDto,
  CreateLabOrderDto,
  RecordResultDto,
  UpdateLabOrderDto,
} from './dto/labs.dto.js';

@ApiTags('labs')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller()
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get('patients/:patientId/lab-orders')
  @Requires(Actions.PATIENT_READ)
  listForPatient(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.listForPatient(patientId, user);
  }

  @Get('consultations/:id/lab-orders')
  @Requires(Actions.CONSULT_READ)
  listForConsultation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.listForConsultation(id, user);
  }

  @Get('lab-orders/:id')
  @Requires(Actions.PATIENT_READ)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.labs.detail(id, user);
  }

  @Post('lab-orders')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lab.orderCreate',
    entity: 'LabOrder',
    entityIdFrom: 'result:id',
  })
  create(
    @Body() dto: CreateLabOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.create(dto, user);
  }

  @Patch('lab-orders/:id')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lab.orderUpdate',
    entity: 'LabOrder',
    entityIdFrom: 'param:id',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLabOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.update(id, dto, user);
  }

  @Patch('lab-orders/:id/cancel')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lab.orderCancel',
    entity: 'LabOrder',
    entityIdFrom: 'param:id',
  })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.labs.cancel(id, user);
  }

  @Patch('lab-orders/:id/items/:itemId')
  // LAB_RESULT_ENTER, not CONSULT_WRITE. Deliberately granted to DOCTOR and
  // NURSE as well as the lab roles, so clinics that key in referred-in
  // reports keep working — this is a new name for who could already do it,
  // not a narrowing.
  @Requires(Actions.LAB_RESULT_ENTER)
  @Audit({
    action: 'lab.resultRecord',
    entity: 'LabOrderItem',
    entityIdFrom: 'param:itemId',
  })
  recordResult(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: RecordResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.recordResult(id, itemId, dto, user);
  }

  /** Release a result to the chart. */
  @Patch('lab-orders/:id/items/:itemId/verify')
  @Requires(Actions.LAB_RESULT_VERIFY)
  @Audit({
    action: 'lab.resultVerify',
    entity: 'LabOrderItem',
    entityIdFrom: 'param:itemId',
  })
  verifyResult(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.verifyResult(id, itemId, user);
  }

  /**
   * Correct a released result. Requires a stated reason — someone may have
   * acted on the value being replaced.
   */
  @Post('lab-orders/:id/items/:itemId/amend')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.LAB_RESULT_VERIFY)
  @Audit({
    action: 'lab.resultAmend',
    entity: 'LabOrderItem',
    entityIdFrom: 'param:itemId',
  })
  amendResult(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: AmendResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.amendResult(id, itemId, dto, user);
  }

  /** Every value this result has ever held. */
  @Get('lab-orders/:id/items/:itemId/history')
  @Requires(Actions.CONSULT_READ)
  resultHistory(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.resultHistory(id, itemId, user);
  }
}
