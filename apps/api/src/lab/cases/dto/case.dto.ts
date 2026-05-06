import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabCaseStatus, LabCaseUrgency } from '@org/db';

export class CreateLabCaseDto {
  @ApiProperty({ description: 'Lab tenant id (the lab the case is going to).' })
  @IsString()
  labTenantId!: string;

  @ApiProperty({ description: 'Lab product id.' })
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ enum: LabCaseUrgency, enumName: 'LabCaseUrgency' })
  @IsOptional()
  @IsEnum(LabCaseUrgency)
  urgency?: LabCaseUrgency;

  @ApiPropertyOptional({ description: 'ISO 8601 due date for the case.' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({ description: 'Form data matching the product\'s schema.' })
  @IsOptional()
  formData?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Free-text patient identifier (clinic-internal).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  patientLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  doctorLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deliveryCenter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateLabCaseDto {
  @ApiPropertyOptional({ enum: LabCaseUrgency, enumName: 'LabCaseUrgency' })
  @IsOptional()
  @IsEnum(LabCaseUrgency)
  urgency?: LabCaseUrgency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  formData?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  patientLabel?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  doctorLabel?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deliveryCenter?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Lab-only override of unit price (centavos). Used with ADJUST_ON_ORDER products.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPrice?: number | null;
}

export class TransitionLabCaseDto {
  @ApiProperty({ enum: LabCaseStatus, enumName: 'LabCaseStatus' })
  @IsEnum(LabCaseStatus)
  status!: LabCaseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class PresignLabCaseFileDto {
  @ApiProperty({ description: 'Original filename — passed through to S3 metadata.' })
  @IsString()
  @Length(1, 255)
  filename!: string;

  @ApiProperty({ example: 'application/octet-stream' })
  @IsString()
  @MaxLength(127)
  mimeType!: string;

  @ApiProperty({ description: 'File size in bytes.' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class AdvancePhaseDto {
  @ApiPropertyOptional({
    description:
      'Target phase (must match one entry from the product\'s phases array). Omit to advance to the next phase in declared order.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  phase?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateNoteDto {
  @ApiProperty({ description: 'Internal note body (lab-only).' })
  @IsString()
  @Length(1, 4000)
  body!: string;
}

export class UpdateNoteDto {
  @ApiProperty()
  @IsString()
  @Length(1, 4000)
  body!: string;
}

export class CreateMessageDto {
  @ApiProperty({ description: 'Chat message body.' })
  @IsString()
  @Length(1, 4000)
  body!: string;
}

export class UpsertShipmentDto {
  @ApiPropertyOptional({ example: 'LBC' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string | null;

  @ApiPropertyOptional({ example: 'AB1234567PH' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
