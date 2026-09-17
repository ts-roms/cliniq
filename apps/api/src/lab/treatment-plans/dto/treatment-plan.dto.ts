import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LabTreatmentPlanDecision,
  LabTreatmentPlanFileKind,
} from '@org/db';

export class CreateTreatmentPlanDto {
  @ApiProperty({ description: 'Lab case id this plan attaches to.' })
  @IsString()
  caseId!: string;

  @ApiProperty({ example: 'Aligner plan — patient X (rev 1)' })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiProperty({ description: 'Markdown body the clinic decides on.' })
  @IsString()
  @Length(1, 20_000)
  summary!: string;
}

export class UpdateTreatmentPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20_000)
  summary?: string;
}

export class PresignTreatmentPlanFileDto {
  @ApiProperty({ description: 'Original filename — stored on the row.' })
  @IsString()
  @Length(1, 255)
  filename!: string;

  @ApiProperty({ example: 'application/octet-stream' })
  @IsString()
  @MaxLength(127)
  mimeType!: string;

  @ApiProperty({ description: 'Size in bytes.' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiPropertyOptional({
    enum: LabTreatmentPlanFileKind,
    enumName: 'LabTreatmentPlanFileKind',
  })
  @IsOptional()
  @IsEnum(LabTreatmentPlanFileKind)
  kind?: LabTreatmentPlanFileKind;
}

export class DecideTreatmentPlanDto {
  @ApiProperty({
    enum: LabTreatmentPlanDecision,
    enumName: 'LabTreatmentPlanDecision',
  })
  @IsEnum(LabTreatmentPlanDecision)
  decision!: LabTreatmentPlanDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
