import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { RequiresConsent } from '../consents/decorators/requires-consent.decorator.js';
import { ConsentTypeDto } from '../consents/dto/set-consent.dto.js';
import { PrescriptionsService } from './prescriptions.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';

@ApiTags('prescriptions')
@ApiBearerAuth('jwt')
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly rx: PrescriptionsService) {}

  @Post('precheck')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.RX_WRITE)
  @RequiresConsent(ConsentTypeDto.AI_PROCESSING, 'body:patientId')
  precheck(@Body() dto: CreatePrescriptionDto) {
    return this.rx.precheck({
      items: dto.items,
      knownAllergies: dto.knownAllergies,
      currentMedications: dto.currentMedications,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.RX_SIGN)
  @Audit({ action: 'rx.sign', entity: 'Prescription', entityIdFrom: 'result:id' })
  create(@Body() dto: CreatePrescriptionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rx.create(dto, user);
  }

  @Get()
  @Requires(Actions.PATIENT_READ)
  list(@Query('patientId') patientId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rx.listForPatient(patientId, user);
  }

  @Get(':id')
  @Requires(Actions.PATIENT_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rx.findById(id, user);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  @Requires(Actions.PATIENT_READ)
  @Audit({ action: 'rx.pdf.download', entity: 'Prescription', entityIdFrom: 'param:id' })
  async pdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buf = await this.rx.renderPdf(id, user);
    res.setHeader('Content-Disposition', `inline; filename="rx-${id}.pdf"`);
    res.setHeader('Content-Length', buf.length.toString());
    res.end(buf);
  }

  @Post(':id/cancel')
  @Requires(Actions.RX_SIGN)
  @Audit({ action: 'rx.cancel', entity: 'Prescription', entityIdFrom: 'param:id' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rx.cancel(id, user);
  }
}
