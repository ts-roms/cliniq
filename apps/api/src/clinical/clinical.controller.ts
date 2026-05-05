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
import { ClinicalService } from './clinical.service.js';
import {
  CreateAllergyDto,
  CreateConditionDto,
  CreateMedicationDto,
  CreateVitalDto,
} from './dto/clinical.dto.js';

@ApiTags('clinical')
@ApiBearerAuth('jwt')
@Controller('patients/:patientId')
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  // ── Allergies ─────────────────────────────────────
  @Get('allergies')
  @Requires(Actions.PATIENT_READ)
  listAllergies(@Param('patientId') p: string, @CurrentUser() u: AuthenticatedUser) {
    return this.clinical.listAllergies(p, u);
  }
  @Post('allergies')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'allergy.add', entity: 'Allergy', entityIdFrom: 'result:id' })
  addAllergy(
    @Param('patientId') p: string,
    @Body() dto: CreateAllergyDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.clinical.addAllergy(p, dto, u);
  }
  @Delete('allergies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'allergy.delete', entity: 'Allergy', entityIdFrom: 'param:id' })
  removeAllergy(
    @Param('patientId') p: string,
    @Param('id') id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.clinical.removeAllergy(p, id, u);
  }

  // ── Medications ──────────────────────────────────
  @Get('medications')
  @Requires(Actions.PATIENT_READ)
  listMeds(@Param('patientId') p: string, @CurrentUser() u: AuthenticatedUser) {
    return this.clinical.listMedications(p, u);
  }
  @Post('medications')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'medication.add', entity: 'Medication', entityIdFrom: 'result:id' })
  addMed(
    @Param('patientId') p: string,
    @Body() dto: CreateMedicationDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.clinical.addMedication(p, dto, u);
  }

  // ── Conditions ───────────────────────────────────
  @Get('conditions')
  @Requires(Actions.PATIENT_READ)
  listConditions(@Param('patientId') p: string, @CurrentUser() u: AuthenticatedUser) {
    return this.clinical.listConditions(p, u);
  }
  @Post('conditions')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'condition.add', entity: 'Condition', entityIdFrom: 'result:id' })
  addCondition(
    @Param('patientId') p: string,
    @Body() dto: CreateConditionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.clinical.addCondition(p, dto, u);
  }

  // ── Vitals ───────────────────────────────────────
  @Get('vitals')
  @Requires(Actions.PATIENT_READ)
  listVitals(@Param('patientId') p: string, @CurrentUser() u: AuthenticatedUser) {
    return this.clinical.listVitals(p, u);
  }
  @Post('vitals')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'vital.record', entity: 'Vital', entityIdFrom: 'result:id' })
  addVital(
    @Param('patientId') p: string,
    @Body() dto: CreateVitalDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.clinical.addVital(p, dto, u);
  }
}
