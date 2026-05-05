import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { DERM_V1, renderDermUserMessage } from '@org/ai-prompts';
import { BedrockService } from '../bedrock/bedrock.service.js';

class DermatologyContextDto {
  @ApiProperty({ required: false }) age?: number;
  @ApiProperty({ required: false }) sex?: string;
  @ApiProperty({ required: false, type: [String] }) allergies?: string[];
  @ApiProperty({ required: false }) presentingComplaint?: string;
}

class DermatologyDraftRequestDto {
  @ApiProperty()
  @IsString()
  consultationId!: string;

  @ApiProperty({ type: [String], description: 'S3 keys of uploaded clinical photos' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  imageS3Keys!: string[];

  @ApiProperty({ type: DermatologyContextDto })
  @IsObject()
  patientContext!: DermatologyContextDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  s3Bucket?: string;
}

class DermatologyDraftResponseDto {
  @ApiProperty() draft!: Record<string, unknown>;
  @ApiProperty() promptVersion!: string;
  @ApiProperty() model!: string;
  @ApiProperty() inputTokens!: number;
  @ApiProperty() outputTokens!: number;
  @ApiProperty() cacheReadTokens!: number;
  @ApiProperty() latencyMs!: number;
  @ApiProperty() imageCount!: number;
}

/**
 * Dermatology AI decision-support boundary. Doctor-facing only — never returns
 * a diagnosis to a patient (per docs/07 + docs/09 SaMD positioning).
 *
 * The api uploads images via the presigned S3 flow + sends the s3Keys here.
 * In v1 we forward only the keys; multimodal call to Bedrock with image bytes
 * is a TODO once the api emits short-lived presigned GETs for ai-service.
 */
@ApiTags('dermatology')
@ApiBearerAuth('jwt')
@Controller('dermatology')
export class DermatologyController {
  private readonly logger = new Logger(DermatologyController.name);

  constructor(private readonly bedrock: BedrockService) {}

  @Post('draft')
  @HttpCode(HttpStatus.OK)
  async draft(@Body() dto: DermatologyDraftRequestDto): Promise<DermatologyDraftResponseDto> {
    const userMessage = renderDermUserMessage({
      patientContext: dto.patientContext,
      imageCount: dto.imageS3Keys.length,
    });

    const result = await this.bedrock.converse({
      systemPrompt: DERM_V1.systemPrompt,
      systemPromptId: DERM_V1.id,
      cacheSystemPrompt: true,
      userMessages: [
        {
          role: 'user',
          content: [
            { text: userMessage },
            {
              text:
                `\n\n[image-references]\n` +
                dto.imageS3Keys.map((k, i) => `${i + 1}: s3://${dto.s3Bucket ?? 'default'}/${k}`).join('\n'),
            },
          ],
        },
      ],
      maxTokens: 1500,
      temperature: 0.2,
    });

    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(result.text);
    } catch (err) {
      this.logger.warn(`derm draft did not parse as JSON: ${(err as Error).message}`);
      throw new BadRequestException('AI output failed schema validation');
    }

    return {
      draft,
      promptVersion: DERM_V1.id,
      model: result.model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      cacheReadTokens: result.usage.cacheReadInputTokens ?? 0,
      latencyMs: result.latencyMs,
      imageCount: dto.imageS3Keys.length,
    };
  }
}
