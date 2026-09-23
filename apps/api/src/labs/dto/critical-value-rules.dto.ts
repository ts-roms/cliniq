import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Sex } from '@org/db';

export class CreateCriticalValueRuleDto {
  /**
   * The test this covers. Matched against a LabOrderItem's `testCode`, falling
   * back to its `testName`, after both are normalised the same way — so "K",
   * "k" and " K " are one rule.
   */
  @ApiProperty({ description: 'Test code or name, e.g. "K" or "Potassium"' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  test!: string;

  @ApiProperty({ description: 'Shown to staff, e.g. "Potassium (serum)"' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({
    description:
      'At or below this value the result is CRITICAL_LOW. At least one of criticalLow / criticalHigh is required.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  criticalLow?: number;

  @ApiPropertyOptional({
    description: 'At or above this value the result is CRITICAL_HIGH.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  criticalHigh?: number;

  @ApiPropertyOptional({ description: 'Inclusive lower age bound, in days.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ageMinDays?: number;

  @ApiPropertyOptional({ description: 'Exclusive upper age bound, in days.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ageMaxDays?: number;

  @ApiPropertyOptional({
    enum: Sex,
    description: 'Omit to apply the rule to any sex.',
  })
  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;

  @ApiPropertyOptional({
    description: 'Defaults to now. Set it to schedule a change of limits.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;
}

/**
 * Limits themselves are deliberately NOT updatable — superseding a rule means
 * inserting a new one with a later `effectiveFrom`, so a result flagged last
 * year can still be explained by the limits in force at the time. Only the
 * presentational fields and the end of the window can be edited.
 */
export class UpdateCriticalValueRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;

  @ApiPropertyOptional({
    description: 'When this rule stops applying. Must be after effectiveFrom.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}
