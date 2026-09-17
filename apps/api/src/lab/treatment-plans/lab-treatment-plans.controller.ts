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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabTreatmentPlansService } from './lab-treatment-plans.service.js';
import {
  CreateTreatmentPlanDto,
  PresignTreatmentPlanFileDto,
  UpdateTreatmentPlanDto,
} from './dto/treatment-plan.dto.js';

/**
 * Lab-side: compose, propose, attach files. Mounted at /api/lab/treatment-plans.
 * Gated by LAB_TREATMENT_PLAN (Premium-only feature).
 */
@ApiTags('lab-treatment-plans')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_TREATMENT_PLAN)
@Controller('lab/treatment-plans')
export class LabTreatmentPlansController {
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.treatment_plan.create',
    entity: 'LabTreatmentPlan',
    entityIdFrom: 'result:id',
  })
  create(
    @Body() dto: CreateTreatmentPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.createDraft(dto, user);
  }

  @Patch(':id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.treatment_plan.update',
    entity: 'LabTreatmentPlan',
    entityIdFrom: 'param:id',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTreatmentPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.update(id, dto, user);
  }

  @Post(':id/propose')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.treatment_plan.propose',
    entity: 'LabTreatmentPlan',
    entityIdFrom: 'param:id',
  })
  propose(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.plans.propose(id, user);
  }

  @Post(':id/files/presign')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.treatment_plan.file.presign',
    entity: 'LabTreatmentPlan',
    entityIdFrom: 'param:id',
  })
  presignFile(
    @Param('id') id: string,
    @Body() dto: PresignTreatmentPlanFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.presignFile(id, dto, user);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.treatment_plan.file.delete',
    entity: 'LabTreatmentPlanFile',
    entityIdFrom: 'param:fileId',
  })
  deleteFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.plans.deleteFile(id, fileId, user);
  }

  /**
   * AI assist: draft a treatment plan summary for a case. Returns markdown
   * the lab pastes into the plan editor (LabTreatmentPlan.summary). Gated
   * by LAB_AI_ASSIST (Premium-only).
   */
  @Post('draft-summary')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_AI_ASSIST)
  @Audit({
    action: 'lab.treatment_plan.ai_draft',
    entity: 'LabCase',
  })
  draftSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('caseId') caseId: string,
  ) {
    return this.plans.draftSummary(caseId, user);
  }
}
