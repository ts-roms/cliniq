import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionItemInputDto {
  @ApiPropertyOptional({ description: 'Drug catalog id (preferred over free-text)' })
  @IsOptional()
  @IsString()
  drugId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  drugName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  strength?: string;

  @ApiPropertyOptional({ description: 'tab, syrup, drops, etc.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  form?: string;

  @ApiProperty({ description: 'e.g. "1 tab"' })
  @IsString()
  @MaxLength(40)
  dose!: string;

  @ApiProperty({ description: 'e.g. "BID", "every 6h"' })
  @IsString()
  @MaxLength(40)
  frequency!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  quantity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instructions?: string;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  refills?: number;
}

export class CreatePrescriptionDto {
  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiPropertyOptional({ description: 'Optional consultation to anchor the Rx' })
  @IsOptional()
  @IsString()
  consultationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ type: [String], description: 'Patient allergy substances at issue time' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knownAllergies?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Patient active medications at issue time' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currentMedications?: string[];

  @ApiProperty({ type: [PrescriptionItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemInputDto)
  items!: PrescriptionItemInputDto[];

  @ApiPropertyOptional({
    description: 'Override the safety check. Doctor takes responsibility — recorded in audit.',
    default: false,
  })
  @IsOptional()
  override?: boolean;
}
