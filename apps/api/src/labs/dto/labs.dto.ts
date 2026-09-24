import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabAbnormalFlag, LabOrderStatus } from '@org/db';

export class LabOrderItemInputDto {
  /**
   * Order from the catalogue. When set, the test's code, name, specimen and
   * component unit are SNAPSHOTTED onto the item, so the order reads as it
   * was placed even after the catalogue is edited — and `testName` becomes
   * optional because the catalogue supplies it.
   *
   * Omitting it still works: a laboratory may order something ad hoc, and
   * orders placed before the catalogue existed have no entry to point at.
   */
  @ApiPropertyOptional({
    description:
      'Catalogue test to order. Supplies code/name/unit; testName is then optional.',
  })
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  testCode?: string;
  @ApiPropertyOptional({
    description: 'Required unless testId is given, which supplies it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  testName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  resultUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referenceLow?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referenceHigh?: number;

  /**
   * Per-order critical limits. Leave these unset and the tenant's configured
   * CriticalValueRule applies. They are never derived from the reference
   * interval — see apps/api/src/labs/flagging.ts.
   */
  @ApiPropertyOptional({
    description:
      "Overrides the tenant's critical rule for this order only. At or below this value the result is CRITICAL_LOW.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  criticalLow?: number;

  @ApiPropertyOptional({
    description:
      "Overrides the tenant's critical rule for this order only. At or above this value the result is CRITICAL_HIGH.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  criticalHigh?: number;
}

export class CreateLabOrderDto {
  @ApiProperty() @IsString() patientId!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() consultationId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vendor?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalRef?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;

  @ApiProperty({ type: [LabOrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LabOrderItemInputDto)
  items!: LabOrderItemInputDto[];
}

export class UpdateLabOrderDto {
  @ApiPropertyOptional({ enum: LabOrderStatus })
  @IsOptional()
  @IsEnum(LabOrderStatus)
  status?: LabOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  vendor?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalRef?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  collectedAt?: Date;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedAt?: Date;
}

export class RecordResultDto {
  @ApiProperty() @IsString() resultValue!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  resultUnit?: string;

  @ApiPropertyOptional({ enum: LabAbnormalFlag })
  @IsOptional()
  @IsEnum(LabAbnormalFlag)
  abnormalFlag?: LabAbnormalFlag;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  comment?: string;
}

/**
 * Correct a result that has already been released.
 *
 * `reason` is required and not merely documentation: a clinician may have
 * acted on the superseded value, and a correction nobody can explain is not
 * reviewable. There is a CHECK constraint behind it too.
 */
export class AmendResultDto {
  @ApiProperty() @IsString() resultValue!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  resultUnit?: string;

  @ApiPropertyOptional({ enum: LabAbnormalFlag })
  @IsOptional()
  @IsEnum(LabAbnormalFlag)
  abnormalFlag?: LabAbnormalFlag;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  comment?: string;

  @ApiProperty({ description: 'Why the released value is being changed.' })
  // Trim BEFORE the length check, or "   " passes as a three-character
  // explanation and the CHECK constraint rejects it with a 500 instead.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
