import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { DentalService } from './dental.service.js';
import { UpsertDentalChartDto } from './dto/dental.dto.js';

@ApiTags('dental')
@ApiBearerAuth('jwt')
@Controller()
export class DentalController {
  constructor(private readonly dental: DentalService) {}

  // ── Patient-scoped ────────────────────────────────
  @Get('patients/:patientId/dental-chart')
  @Requires(Actions.PATIENT_READ)
  getLatest(
    @Param('patientId') p: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.dental.getLatestForPatient(p, u);
  }

  @Get('patients/:patientId/dental-charts')
  @Requires(Actions.PATIENT_READ)
  listHistory(
    @Param('patientId') p: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.dental.listForPatient(p, u);
  }

  @Post('patients/:patientId/dental-chart')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'dental.chart.upsert', entity: 'DentalChart', entityIdFrom: 'result:id' })
  upsert(
    @Param('patientId') p: string,
    @Body() dto: UpsertDentalChartDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.dental.upsertForPatient(p, dto, u);
  }

  // ── Chart-scoped ──────────────────────────────────
  @Get('dental-charts/:id')
  @Requires(Actions.PATIENT_READ)
  getOne(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.dental.getById(id, u);
  }

  @Delete('dental-charts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'dental.chart.delete', entity: 'DentalChart', entityIdFrom: 'param:id' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.dental.softDelete(id, u);
  }
}
