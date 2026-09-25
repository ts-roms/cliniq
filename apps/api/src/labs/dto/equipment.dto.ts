import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EquipmentStatus } from '@org/db';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** An analyser or other instrument. Keyed by name within the tenant. */
export class UpsertEquipmentDto {
  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: EquipmentStatus, enumName: 'EquipmentStatus' })
  @IsEnum(EquipmentStatus)
  status!: EquipmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(160)
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(160)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({
    description:
      'How often calibration is due. Omit when the laboratory has not set one — that is reported as "no interval", not as compliant.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  calibrationIntervalDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  commissionedOn?: Date;
}

/** A calibration event. Append-only — there is no edit. */
export class RecordCalibrationDto {
  @ApiProperty() @IsString() equipmentId!: string;

  @ApiPropertyOptional({
    description:
      'Set when only one analyte was recalibrated, which is the common case on a chemistry analyser. Omit for a whole-instrument calibration.',
  })
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional({ description: 'Defaults to now.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  calibratedAt?: Date;

  @ApiPropertyOptional({ description: 'The calibrator material and its lot.' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  calibratorLot?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  passed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * A lot of diagnostic reagent.
 *
 * `openedOn` and `openStabilityDays` together are the second clock: a lot
 * months from its printed expiry can be unusable because it was opened weeks
 * ago, and the earlier of the two limits is the one that counts.
 */
export class UpsertReagentLotDto {
  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  lotNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(160)
  manufacturer?: string;

  @ApiPropertyOptional({ description: "The manufacturer's printed expiry." })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresOn?: Date;

  @ApiPropertyOptional({
    description:
      'When the vial was first opened. The in-use clock starts here.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  openedOn?: Date;

  @ApiPropertyOptional({ description: 'Days usable once opened.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  openStabilityDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedOn?: Date;

  @ApiPropertyOptional({ description: 'The instrument it is loaded on.' })
  @IsOptional()
  @IsString()
  equipmentId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
