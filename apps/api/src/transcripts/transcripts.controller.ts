import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { FilesService } from '../files/files.service.js';
import { AiClientService } from '../ai-client/ai-client.service.js';
import { AiBudgetService } from '../ai-budget/ai-budget.service.js';

/**
 * Estimate STT cost in centavos. Most STT pricing is per audio-second, not
 * per token, so we keep a simple table here and bill from `durationSec` if
 * the provider returned it.
 */
function estimateSttCostCentavos(
  durationSec: number | undefined,
  provider: string,
): number {
  if (!durationSec || durationSec <= 0) return 1;
  const minutes = durationSec / 60;
  const pesoPerMinute = /transcribe-medical/i.test(provider)
    ? 0.014
    : /whisper/i.test(provider)
      ? 0.0036
      : 0.0072;
  return Math.max(1, Math.ceil(minutes * pesoPerMinute * 100));
}

class TranscribeFileDto {
  @ApiProperty({ description: 'fileId returned by POST /api/files/presign' })
  @IsString()
  fileId!: string;
}

class TranscribeResponseDto {
  @ApiProperty() transcript!: string;
  @ApiProperty() provider!: string;
  @ApiProperty() fileId!: string;
}

/**
 * Audio → transcript boundary. The web client first uploads the audio file
 * via the presigned URL flow (POST /api/files/presign + PUT to S3), then
 * POSTs the resulting fileId here. The api confirms the upload landed,
 * then forwards the S3 key to ai-service for STT.
 *
 * The api never holds the audio bytes — only ai-service reads from the PHI
 * bucket, keeping STT credentials and PHI access narrowly scoped.
 */
@ApiTags('transcripts')
@ApiBearerAuth('jwt')
@Controller('transcripts')
export class TranscriptsController {
  constructor(
    private readonly files: FilesService,
    private readonly ai: AiClientService,
    private readonly config: ConfigService,
    private readonly budget: AiBudgetService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.AI_USE)
  @Audit({
    action: 'ai.transcribe',
    entity: 'FileObject',
    entityIdFrom: 'body:id',
  })
  async transcribe(
    @Body() dto: TranscribeFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TranscribeResponseDto> {
    // Refuse the call if the tenant's monthly AI cap is hit. Throws 429 with
    // the usage payload so the web client can show "AI budget reached".
    await this.budget.assertNotExceeded(user.tenantId);

    const file = await this.files.confirm(dto.fileId, user);
    if (file.category !== 'CONSULT_AUDIO') {
      throw new BadRequestException('File must be category CONSULT_AUDIO');
    }
    const bucket = file.isPhi
      ? (this.config.get<string>('S3_BUCKET_PHI') ?? 'cliniq-phi-dev')
      : (this.config.get<string>('S3_BUCKET_PUBLIC') ?? 'cliniq-public-dev');

    const result = await this.ai.transcribe({
      s3Bucket: bucket,
      s3Key: file.s3Key,
      mimeType: file.mimeType,
    });

    // Bill duration. `record` is fire-and-forget by design — losing the
    // ledger update must never break the user-visible transcript.
    void this.budget
      .record(
        user.tenantId,
        estimateSttCostCentavos(result.durationSec, result.provider),
      )
      .catch(() => {
        /* logged inside the service */
      });

    return {
      transcript: result.transcript,
      provider: result.provider,
      fileId: file.id,
    };
  }
}
