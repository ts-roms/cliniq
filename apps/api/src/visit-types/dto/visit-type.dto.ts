import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_CLINIC_MODULES } from '@org/shared-types';

export class CreateVisitTypeDto {
  @ApiProperty({ example: 'Dental cleaning' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Short internal code, e.g. DENT-CLN' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: ALL_CLINIC_MODULES,
    description:
      'Clinical modules this visit focuses. Empty means a general visit ' +
      'with no emphasis. Validated against the module catalogue, not stored ' +
      'blindly — an unknown id here would silently focus nothing.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_CLINIC_MODULES, { each: true })
  modules?: string[];

  @ApiPropertyOptional({
    description: 'Pre-selected in the picker; at most one per tenant.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateVisitTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ isArray: true, enum: ALL_CLINIC_MODULES })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_CLINIC_MODULES, { each: true })
  modules?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
