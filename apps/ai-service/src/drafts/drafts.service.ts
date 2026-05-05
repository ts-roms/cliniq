import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SOAP_V1, renderSoapUserMessage, type SoapDraftInput } from '@org/ai-prompts';
import { BedrockService } from '../bedrock/bedrock.service.js';
import type { SoapDraftResponseDto } from './dto/soap-draft.dto.js';

@Injectable()
export class DraftsService {
  private readonly logger = new Logger(DraftsService.name);

  constructor(private readonly bedrock: BedrockService) {}

  async draftSoap(input: SoapDraftInput): Promise<SoapDraftResponseDto & { rawText: string }> {
    const result = await this.bedrock.converse({
      systemPrompt: SOAP_V1.systemPrompt,
      systemPromptId: SOAP_V1.id,
      cacheSystemPrompt: true,
      userMessages: [
        {
          role: 'user',
          content: [{ text: renderSoapUserMessage(input) }],
        },
      ],
      maxTokens: 1500,
      temperature: 0.2,
    });

    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(result.text);
    } catch (err) {
      this.logger.warn(`SOAP draft did not parse as JSON: ${(err as Error).message}`);
      throw new BadRequestException('AI output failed schema validation');
    }

    return {
      draft,
      rawText: result.text,
      promptVersion: SOAP_V1.id,
      model: result.model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cacheReadTokens: result.usage.cacheReadInputTokens ?? 0,
      latencyMs: result.latencyMs,
    };
  }
}
