import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabMaterialLotStatus } from '@org/db';

export class CreateMaterialDto {
  @ApiProperty({ example: 'Zirconia disc (Translucent)' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sku?: string;

  @ApiPropertyOptional({ example: 'CAD/CAM blocks' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ example: 'g', description: 'Unit of measure (g, ml, pcs, cc).' })
  @IsOptional()
  @IsString()
  @Length(1, 16)
  unitOfMeasure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultSupplier?: string;
}

export class UpdateMaterialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 64)
  sku?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 16)
  unitOfMeasure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultSupplier?: string | null;
}

export class CreateLotDto {
  @ApiProperty()
  @IsString()
  @Length(1, 64)
  lotNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  @ApiProperty({ description: 'Initial quantity in the material UOM.' })
  @IsNumber()
  @Min(0)
  initialQty!: number;

  @ApiPropertyOptional({ description: 'Per-unit price in centavos.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  receivedAt?: string;

  @ApiPropertyOptional({ enum: LabMaterialLotStatus, enumName: 'LabMaterialLotStatus' })
  @IsOptional()
  @IsEnum(LabMaterialLotStatus)
  status?: LabMaterialLotStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateLotDto {
  @ApiPropertyOptional({ enum: LabMaterialLotStatus, enumName: 'LabMaterialLotStatus' })
  @IsOptional()
  @IsEnum(LabMaterialLotStatus)
  status?: LabMaterialLotStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class RecordUsageDto {
  @ApiProperty()
  @IsString()
  lotId!: string;

  @ApiProperty({ description: 'Quantity used in the material UOM.' })
  @IsNumber()
  @Min(0)
  qty!: number;
}
