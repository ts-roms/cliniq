import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateConsultationDto {
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

  @ApiPropertyOptional({ description: 'ICD-10 codes', isArray: true, type: String })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diagnosisCodes?: string[];
}
