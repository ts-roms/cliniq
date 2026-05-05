import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Dentition, SurfaceFinding, ToothStatus, ToothSurface } from '@org/db';

// FDI/ISO numbering: 11-18, 21-28, 31-38, 41-48 adult; 51-55, 61-65, 71-75, 81-85 deciduous.
const FDI_TOOTH_RE = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

export class SurfaceFindingDto {
  @ApiProperty({ enum: ToothSurface })
  @IsEnum(ToothSurface)
  surface!: ToothSurface;

  @ApiProperty({ enum: SurfaceFinding })
  @IsEnum(SurfaceFinding)
  finding!: SurfaceFinding;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;
}

export class ToothEntryDto {
  @ApiProperty({ example: '11', description: 'FDI tooth code' })
  @IsString()
  @Matches(FDI_TOOTH_RE, { message: 'toothCode must be a valid FDI code (e.g. 11–48, 51–85)' })
  toothCode!: string;

  @ApiPropertyOptional({ enum: ToothStatus, default: ToothStatus.PRESENT })
  @IsOptional()
  @IsEnum(ToothStatus)
  status?: ToothStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;

  @ApiPropertyOptional({ type: [SurfaceFindingDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => SurfaceFindingDto)
  surfaces?: SurfaceFindingDto[];
}

export class UpsertDentalChartDto {
  @ApiPropertyOptional({ enum: Dentition, default: Dentition.ADULT })
  @IsOptional()
  @IsEnum(Dentition)
  dentition?: Dentition;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional consultation to attach this chart to' })
  @IsOptional()
  @IsString()
  consultationId?: string;

  @ApiProperty({ type: [ToothEntryDto] })
  @IsArray()
  @ArrayMaxSize(52)
  @ValidateNested({ each: true })
  @Type(() => ToothEntryDto)
  teeth!: ToothEntryDto[];
}
