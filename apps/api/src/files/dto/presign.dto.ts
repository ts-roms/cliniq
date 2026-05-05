import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export enum FileCategoryDto {
  PATIENT_DOC = 'PATIENT_DOC',
  CONSULT_ATTACHMENT = 'CONSULT_ATTACHMENT',
  CONSULT_AUDIO = 'CONSULT_AUDIO',
  RX_PDF = 'RX_PDF',
  INVOICE_PDF = 'INVOICE_PDF',
  RECEIPT_PDF = 'RECEIPT_PDF',
  AVATAR = 'AVATAR',
  CLINIC_LOGO = 'CLINIC_LOGO',
  SIGNATURE = 'SIGNATURE',
  OTHER = 'OTHER',
}

export class PresignRequestDto {
  @ApiProperty({ enum: FileCategoryDto })
  @IsEnum(FileCategoryDto)
  category!: FileCategoryDto;

  @ApiProperty({ description: 'Original filename, used for content-disposition' })
  @IsString()
  @Matches(/^[\w.\-+ ()]{1,200}$/, { message: 'invalid filename characters' })
  filename!: string;

  @ApiProperty({ description: 'MIME type, e.g. audio/webm, application/pdf' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ description: 'Expected size in bytes (browser-provided)' })
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024) // 50 MB hard cap
  sizeBytes!: number;

  @ApiPropertyOptional({ description: 'Mark as PHI. Defaults true for clinical categories.' })
  @IsOptional()
  @IsBoolean()
  isPhi?: boolean;
}

export class PresignResponseDto {
  @ApiProperty() fileId!: string;
  @ApiProperty() s3Key!: string;
  @ApiProperty() uploadUrl!: string;
  @ApiProperty() expiresInSec!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  headers!: Record<string, string>;
}

export class ConfirmUploadDto {
  @ApiProperty() fileId!: string;
}
