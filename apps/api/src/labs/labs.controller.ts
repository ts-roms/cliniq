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
  listForConsultation(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
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
  @Audit({ action: 'lab.orderCreate', entity: 'LabOrder', entityIdFrom: 'result:id' })
  create(@Body() dto: CreateLabOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.labs.create(dto, user);
  }

  @Patch('lab-orders/:id')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({ action: 'lab.orderUpdate', entity: 'LabOrder', entityIdFrom: 'param:id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLabOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.update(id, dto, user);
  }

  @Patch('lab-orders/:id/cancel')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({ action: 'lab.orderCancel', entity: 'LabOrder', entityIdFrom: 'param:id' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.labs.cancel(id, user);
  }

  @Patch('lab-orders/:id/items/:itemId')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({ action: 'lab.resultRecord', entity: 'LabOrderItem', entityIdFrom: 'param:itemId' })
  recordResult(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: RecordResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labs.recordResult(id, itemId, dto, user);
  }
}
