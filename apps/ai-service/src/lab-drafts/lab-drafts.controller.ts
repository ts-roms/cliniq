import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LabDraftsService } from './lab-drafts.service.js';
import {
  LabPlanDraftRequestDto,
  LabPlanDraftResponseDto,
} from './dto/plan-draft.dto.js';

@ApiTags('lab-drafts')
@Controller('lab-drafts')
export class LabDraftsController {
  constructor(private readonly drafts: LabDraftsService) {}

  @Post('treatment-plan')
  @HttpCode(HttpStatus.OK)
  treatmentPlan(
    @Body() dto: LabPlanDraftRequestDto,
  ): Promise<LabPlanDraftResponseDto> {
    return this.drafts.draftTreatmentPlan(dto);
  }
}
