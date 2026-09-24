import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LabResultType } from '@org/db';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateLabSectionDto {
  @ApiProperty({ description: 'Short code, e.g. HEMATOLOGY.' })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @ApiProperty({ description: 'What staff see, e.g. "Hematology".' })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateLabSectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    description:
      'Retire a section without deleting it. Tests already on it keep working.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestComponentInputDto {
  @ApiProperty({ description: 'Analyte code, e.g. HGB.' })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: LabResultType })
  @IsOptional()
  @IsEnum(LabResultType)
  resultType?: LabResultType;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({
    description:
      'Decimal places for display. Four places on a haemoglobin is false precision.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  decimals?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(40)
  loincCode?: string;
}

export class CreateLaboratoryTestDto {
  @ApiProperty({
    description:
      "The laboratory's own code, e.g. CBC or K. CriticalValueRule matches on this.",
  })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ description: 'Section id this test belongs to.' })
  @IsString()
  sectionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  shortName?: string;

  @ApiPropertyOptional({ description: 'LOINC, kept separate from `code`.' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(40)
  loincCode?: string;

  @ApiPropertyOptional({ description: 'e.g. "Whole blood (EDTA)".' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  specimenType?: string;

  @ApiPropertyOptional({ description: 'e.g. "Lavender top".' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  container?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minVolumeMl?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  collectionInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  processingInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  method?: string;

  @ApiPropertyOptional({ description: 'Routine turnaround target, minutes.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetTatMinutes?: number;

  @ApiPropertyOptional({ description: 'STAT turnaround target, minutes.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  statTatMinutes?: number;

  /**
   * The analytes this test reports. A CBC supplies several; a potassium
   * supplies one. Omitting them entirely creates a test that reports nothing,
   * which the service refuses.
   */
  @ApiProperty({ type: [TestComponentInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestComponentInputDto)
  components!: TestComponentInputDto[];
}

export class UpdateLaboratoryTestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  shortName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  specimenType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  container?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetTatMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  statTatMinutes?: number;

  @ApiPropertyOptional({
    description:
      'Retire a test without deleting it. Orders already placed from it keep their snapshot.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
