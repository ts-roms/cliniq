import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SpecimenRejectionReason, SpecimenStatus } from '@org/db';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CollectSpecimenDto {
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
  volumeMl?: number;

  @ApiPropertyOptional({ description: 'e.g. "Left antecubital".' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  collectionSite?: string;

  @ApiPropertyOptional({
    description: 'When it was drawn. Defaults to now.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  collectedAt?: Date;

  /**
   * Which of the order's tests go onto THIS tube. Omit for the common
   * single-tube case and every unassigned item is attached; pass it when an
   * order needs more than one specimen type.
   */
  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description:
      'Order item ids for this tube. Omit to take every item not yet on a specimen.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];
}

export class ReceiveSpecimenDto {
  @ApiPropertyOptional({ description: 'Defaults to now.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedAt?: Date;

  @ApiPropertyOptional({ description: 'e.g. "Fridge 2, rack B".' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  storageLocation?: string;
}

export class RejectSpecimenDto {
  @ApiProperty({ enum: SpecimenRejectionReason })
  @IsEnum(SpecimenRejectionReason)
  reason!: SpecimenRejectionReason;

  @ApiPropertyOptional({
    description:
      'Required when the reason is OTHER — "other" with no explanation is not a reason.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class TransitionSpecimenDto {
  @ApiProperty({
    enum: SpecimenStatus,
    description:
      'PROCESSING, COMPLETED, CANCELLED or REFERRED. Collection, reception and rejection have their own routes.',
  })
  @IsEnum(SpecimenStatus)
  status!: SpecimenStatus;
}
