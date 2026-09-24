import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LtoCategory } from '@org/db';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * The laboratory's Licence to Operate details.
 *
 * Head and pathologist are names plus PRC numbers rather than user
 * references: the pathologist of record is frequently a visiting consultant
 * with no account here, and a report that cannot name them is not compliant.
 */
export class UpsertLaboratoryDto {
  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'DOH Licence to Operate number.' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  dohLtoNumber?: string;

  @ApiProperty({ enum: LtoCategory, enumName: 'LtoCategory' })
  @IsEnum(LtoCategory)
  category!: LtoCategory;

  @ApiPropertyOptional({
    description: 'e.g. "GENERAL, FREESTANDING" — as printed on the LTO.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  classification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validFrom?: Date;

  @ApiPropertyOptional({ description: 'When the LTO expires.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  headName?: string;

  @ApiPropertyOptional({ description: 'PRC licence number.' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  headLicenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  pathologistName?: string;

  @ApiPropertyOptional({ description: 'PRC licence number.' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  pathologistLicenseNumber?: string;
}

/**
 * Declare or withdraw capability.
 *
 * Exactly one of `sectionId` / `testId`. Naming both would be ambiguous
 * about which the precedence rule follows; naming neither says nothing.
 */
export class SetCapabilityDto {
  @ApiPropertyOptional({ description: 'A whole section.' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiPropertyOptional({
    description: 'A single test. Overrides whatever its section says.',
  })
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'False records that this is explicitly NOT performed here.',
  })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
