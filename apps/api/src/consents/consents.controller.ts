import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { ConsentsService } from './consents.service.js';
import { SetConsentDto } from './dto/set-consent.dto.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';

@ApiTags('consents')
@ApiBearerAuth('jwt')
@Controller('patients/:patientId/consents')
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get()
  @Requires(Actions.PATIENT_READ)
  list(@Param('patientId') patientId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.consents.listForPatient(patientId, user);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'consent.set', entity: 'PatientConsent', entityIdFrom: 'param:patientId' })
  set(
    @Param('patientId') patientId: string,
    @Body() dto: SetConsentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.consents.set(patientId, dto, user, req);
  }
}
