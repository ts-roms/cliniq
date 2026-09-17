import { Injectable, Logger } from '@nestjs/common';
import {
  LAB_TREATMENT_PLAN_V1,
  renderLabTreatmentPlanUserMessage,
} from '@org/ai-prompts';
import { BedrockService } from '../bedrock/bedrock.service.js';
import type {
  LabPlanDraftRequestDto,
  LabPlanDraftResponseDto,
} from './dto/plan-draft.dto.js';

@Injectable()
export class LabDraftsService {
  private readonly logger = new Logger(LabDraftsService.name);

  constructor(private readonly bedrock: BedrockService) {}

  async draftTreatmentPlan(
    input: LabPlanDraftRequestDto,
  ): Promise<LabPlanDraftResponseDto> {
    const result = await this.bedrock.converse({
      systemPrompt: LAB_TREATMENT_PLAN_V1.systemPrompt,
      systemPromptId: LAB_TREATMENT_PLAN_V1.id,
      cacheSystemPrompt: true,
      userMessages: [
        {
          role: 'user',
          content: [
            {
              text: renderLabTreatmentPlanUserMessage({
                case: {
                  refNumber: input.case.refNumber ?? null,
                  productName: input.case.productName,
                  urgency: input.case.urgency,
                  patientLabel: input.case.patientLabel ?? null,
                  doctorLabel: input.case.doctorLabel ?? null,
                  notes: input.case.notes ?? null,
                  formData: input.case.formData ?? null,
                },
                materialsUsed: input.materialsUsed,
              }),
            },
          ],
        },
      ],
      maxTokens: 1200,
      temperature: 0.3,
    });
    return {
      summary: result.text.trim(),
      promptVersion: LAB_TREATMENT_PLAN_V1.id,
      model: result.model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cacheReadTokens: result.usage.cacheReadInputTokens ?? 0,
      latencyMs: result.latencyMs,
    };
  }
}
