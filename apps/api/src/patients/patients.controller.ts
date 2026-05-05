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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { PatientsService } from './patients.service.js';
import { renderPatientExportPdf } from './export/render-pdf.js';
import { CreatePatientDto } from './dto/create-patient.dto.js';
import { UpdatePatientDto } from './dto/update-patient.dto.js';
import { PatientFilterDto } from './dto/patient-filter.dto.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';

@ApiTags('patients')
@ApiBearerAuth('jwt')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'patient.create', entity: 'Patient', entityIdFrom: 'result:id' })
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.patients.create(dto, user);
  }

  @Get()
  @Requires(Actions.PATIENT_READ)
  list(@Query() filter: PatientFilterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.patients.list(filter, user);
  }

  @Get(':id')
  @Requires(Actions.PATIENT_READ)
  @Audit({ action: 'patient.read', entity: 'Patient', entityIdFrom: 'param:id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.patients.findById(id, user);
  }

  @Patch(':id')
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'patient.update', entity: 'Patient', entityIdFrom: 'param:id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.patients.update(id, dto, user);
  }

  @Get(':id/export')
  @Requires(Actions.PATIENT_READ)
  @ApiQuery({ name: 'format', enum: ['json', 'pdf'], required: false })
  @Audit({ action: 'patient.export', entity: 'Patient', entityIdFrom: 'param:id' })
  async exportRecord(
    @Param('id') id: string,
    @Query('format') format: 'json' | 'pdf' = 'json',
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bundle = await this.patients.exportRecord(id, user);
    if (format !== 'pdf') return bundle;

    const pdf = await renderPatientExportPdf(bundle);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="cliniq-export-${bundle.patient.mrn}-${stamp}.pdf"`,
      'content-length': pdf.length.toString(),
    });
    res.send(pdf);
    return undefined;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'patient.delete', entity: 'Patient', entityIdFrom: 'param:id' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.patients.softDelete(id, user);
  }
}
