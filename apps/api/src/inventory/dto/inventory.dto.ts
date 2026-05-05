import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'sku: alphanumerics, . _ - only' })
  sku!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) category?: string;

  @ApiPropertyOptional({ default: 'each' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultPriceCentavos?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isControlled?: boolean;
}

export class UpdateItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unit?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultPriceCentavos?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isControlled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class ReceiveBatchDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  receivedQty!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) lotNumber?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 date — for FEFO ordering' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresOn?: Date;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCostCentavos?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) supplierName?: string;
}

export class AdjustStockDto {
  @ApiProperty({ description: 'Signed delta — negative to write off' })
  @Type(() => Number)
  @IsInt()
  delta!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({ description: 'Specific batch to adjust; defaults to FEFO order' })
  @IsOptional()
  @IsString()
  batchId?: string;
}

export class DispenseStockDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() prescriptionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
