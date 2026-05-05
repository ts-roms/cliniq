import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';

class TranscribeRequestDto {
  @ApiProperty() @IsString() s3Bucket!: string;
  @ApiProperty() @IsString() s3Key!: string;
  @ApiProperty() @IsString() mimeType!: string;
}

class TranscribeResponseDto {
  @ApiProperty() transcript!: string;
  @ApiProperty() provider!: string;
  @ApiProperty({ required: false }) durationSec?: number;
}

/**
 * Speech-to-text boundary. Production wires Whisper (via Bedrock) or Amazon
 * Transcribe here. The MVP returns a stub transcript so the rest of the
 * pipeline (api → ai-service → SOAP draft) can be exercised end-to-end.
 *
 * The api forwards already-uploaded S3 references — ai-service is the only
 * party that should pull bytes from the PHI bucket for STT.
 */
@ApiTags('transcribe')
@ApiBearerAuth('jwt')
@Controller('transcribe')
export class TranscribeController {
  private readonly logger = new Logger(TranscribeController.name);

  @Post()
  @HttpCode(HttpStatus.OK)
  transcribe(@Body() dto: TranscribeRequestDto): TranscribeResponseDto {
    this.logger.log(`stub-transcribe s3://${dto.s3Bucket}/${dto.s3Key} (${dto.mimeType})`);
    return {
      transcript:
        `[stub transcript for s3://${dto.s3Bucket}/${dto.s3Key}]. ` +
        'Replace with the doctor-narrated consult once Whisper / Transcribe is wired.',
      provider: 'stub',
    };
  }
}
