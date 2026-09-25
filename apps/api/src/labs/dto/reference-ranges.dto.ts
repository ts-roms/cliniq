import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
import { Sex } from '@org/db';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * A reference interval for one analyte, optionally narrowed to a kind of
 * patient.
 *
 * `condition`, `methodId` and `equipmentId` from the gap analysis sketch are
 * deliberately absent: nothing supplies any of them at result-entry time, so a
 * row narrowed on one could never be selected. A configured interval that
 * silently never applies is worse than an absent field, because the laboratory
 * believes it is covered.
 */
export class CreateReferenceRangeDto {
  @ApiProperty({
    description:
      'The analyte, as a code or a name. Normalised the same way critical-value rules are, so "K", " k " and "K." land on one key.',
  })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  test!: string;

  @ApiProperty({ description: 'What staff see, e.g. "Haemoglobin (female)".' })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive lower bound on patient age in days. Days, not years, because neonatal intervals change week to week.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ageMinDays?: number;

  @ApiPropertyOptional({ description: 'Exclusive upper bound, in days.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ageMaxDays?: number;

  @ApiPropertyOptional({
    enum: Sex,
    enumName: 'Sex',
    description: 'Omit to apply to any sex.',
  })
  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @ApiPropertyOptional({ description: 'Lower bound of the normal interval.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lowerLimit?: number;

  @ApiPropertyOptional({ description: 'Upper bound of the normal interval.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  upperLimit?: number;

  @ApiPropertyOptional({
    description:
      'The interval as it reads for a non-numeric result: "Negative", "<1:40". Shown to staff; flagging is numeric-only and does not consume it.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  textualRange?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'Defaults to now.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveFrom?: Date;
}

/**
 * What can be changed after the fact.
 *
 * The limits and the narrowing cannot. A reference interval is the explanation
 * for how results were flagged while it applied, so editing its numbers would
 * rewrite the reasoning behind results already on charts. Superseding it — a
 * new row with a later `effectiveFrom`, and `effectiveTo` set on this one — is
 * the supported way to change an interval, and it keeps the history readable.
 */
export class UpdateReferenceRangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'When this interval stops applying.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}
