import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { TranscribeService } from './transcribe.service.js';

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
 * Speech-to-text boundary. Delegates to TranscribeService which fans out to
 * AWS Transcribe (when enabled) or falls back to the local stub.
 */
@ApiTags('transcribe')
@ApiBearerAuth('jwt')
@Controller('transcribe')
export class TranscribeController {
  private readonly logger = new Logger(TranscribeController.name);

  constructor(private readonly transcriber: TranscribeService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async transcribe(
    @Body() dto: TranscribeRequestDto,
  ): Promise<TranscribeResponseDto> {
    const result = await this.transcriber.transcribe(dto);
    this.logger.log(
      `transcribed s3://${dto.s3Bucket}/${dto.s3Key} via ${result.provider} (${result.durationSec ?? '?'}s)`,
    );
    return result;
  }
}
