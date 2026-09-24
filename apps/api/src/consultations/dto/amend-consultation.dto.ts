import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Amend a signed consultation.
 *
 * Only the sections you pass are changed; everything else is carried forward
 * from the current version, because each amendment is stored as a complete
 * snapshot rather than a patch.
 */
export class AmendConsultationDto {
  @ApiProperty({
    description:
      'Why the note is being corrected, e.g. "wrong laterality" or "dose typo". Required — an amendment without one is unreviewable.',
  })
  // Trim BEFORE validating, so "   " is rejected here as a 400 rather than
  // sailing past MinLength(3) on its whitespace and hitting the table's
  // `length(btrim(reason)) > 0` CHECK as a 500.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: 'Subjective (HPI / chief complaint)' })
  @IsOptional()
  @IsObject()
  subjective?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Objective (vitals + exam)' })
  @IsOptional()
  @IsObject()
  objective?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Assessment' })
  @IsOptional()
  @IsObject()
  assessment?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Plan' })
  @IsOptional()
  @IsObject()
  plan?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'ICD-10 codes. Replaces the current list wholesale.',
    isArray: true,
    type: String,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diagnosisCodes?: string[];
}
