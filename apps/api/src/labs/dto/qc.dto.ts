import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { QcLevel } from '@org/db';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * A control material.
 *
 * Name AND lot together identify it: control material is made in batches and
 * the target mean shifts between them, so the same product on a new lot
 * needs its own targets rather than inheriting the old ones.
 */
export class UpsertQcMaterialDto {
  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: QcLevel, enumName: 'QcLevel' })
  @IsEnum(QcLevel)
  level!: QcLevel;

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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresOn?: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** The established mean and SD for one material on one test. */
export class SetQcTargetDto {
  @ApiProperty() @IsString() materialId!: string;
  @ApiProperty() @IsString() testId!: string;

  @ApiProperty() @Type(() => Number) @IsNumber() mean!: number;

  @ApiProperty({ description: 'Must be greater than zero.' })
  @Type(() => Number)
  @IsNumber()
  sd!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(20)
  unit?: string;
}

/** One control result. */
export class RecordQcRunDto {
  @ApiProperty() @IsString() materialId!: string;
  @ApiProperty() @IsString() testId!: string;

  @ApiProperty() @Type(() => Number) @IsNumber() value!: number;

  @ApiPropertyOptional({ description: 'Defaults to now.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  runAt?: Date;

  @ApiPropertyOptional({
    isArray: true,
    type: Number,
    description:
      'z-scores of the other control levels run at the same time. R-4s compares against these — only the bench knows what was actually run together.',
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsNumber({}, { each: true })
  peerZScores?: number[];
}

/** What was done about a rejected run. */
export class CorrectiveActionDto {
  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  correctiveAction!: string;
}
