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
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabTreatmentPlansService } from '../../lab/treatment-plans/lab-treatment-plans.service.js';
import { DecideTreatmentPlanDto } from '../../lab/treatment-plans/dto/treatment-plan.dto.js';

/**
 * Clinic-side endpoints for treatment plans. No feature gate — clinics
 * linked to a Premium-tier lab get free access to the approval surface.
 * Drafts are hidden via the service-layer filter; clinic only sees
 * PROPOSED+ plans.
 */
@ApiTags('clinic-lab-treatment-plans')
@ApiBearerAuth('jwt')
@Controller('clinic/lab-treatment-plans')
export class ClinicLabTreatmentPlansController {
  constructor(private readonly plans: LabTreatmentPlansService) {}

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('caseId') caseId: string,
  ) {
    return this.plans.listForCase(caseId, user);
  }

  @Get(':id')
  @Requires(Actions.TENANT_MANAGE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.plans.findById(id, user);
  }

  @Post(':id/decisions')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_treatment_plan.decide',
    entity: 'LabTreatmentPlan',
    entityIdFrom: 'param:id',
  })
  decide(
    @Param('id') id: string,
    @Body() dto: DecideTreatmentPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.decide(id, dto.decision, dto.notes ?? null, user);
  }
}
