import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ObPregnancyStatus, UltrasoundKind } from '@org/db';

export class CreatePregnancyDto {
  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiPropertyOptional({ description: 'Last menstrual period (ISO date).' })
  @IsOptional()
  @IsISO8601()
  lmp?: string;

  @ApiPropertyOptional({ description: 'Override EDD if known from US dating.' })
  @IsOptional()
  @IsISO8601()
  edd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  eddSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  gravida?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  para?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  bloodType?: string;
}

export class UpdatePregnancyDto {
  @ApiPropertyOptional({ enum: ObPregnancyStatus, enumName: 'ObPregnancyStatus' })
  @IsOptional()
  @IsEnum(ObPregnancyStatus)
  status?: ObPregnancyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  lmp?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  edd?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  eddSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  gravida?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  para?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateObVisitDto {
  @ApiProperty()
  @IsString()
  pregnancyId!: string;

  @ApiPropertyOptional({ description: 'Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  visitDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(45)
  gaWeeks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  gaDays?: number;

  @ApiPropertyOptional({ description: 'Fundal height in cm.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fundalHeightCm?: number;

  @ApiPropertyOptional({ description: 'Fetal heart rate (bpm).' })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(220)
  fetalHeartRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  presentation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateUltrasoundDto {
  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiPropertyOptional({ description: 'Pregnancy id for OB ultrasounds.' })
  @IsOptional()
  @IsString()
  pregnancyId?: string;

  @ApiProperty({ enum: UltrasoundKind, enumName: 'UltrasoundKind' })
  @IsEnum(UltrasoundKind)
  kind!: UltrasoundKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  performedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  indication?: string;

  // Fetal biometry — all optional per scan.
  @ApiPropertyOptional() @IsOptional() @IsNumber() bpdMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() hcMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() acMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() flMm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() estimatedFetalWeightG?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() amnioticFluidIndexCm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() fetalHeartRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) presentation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) placentaLocation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) fetalSex?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  findings?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  impression?: string;
}

export class PresignUltrasoundFileDto {
  @ApiProperty()
  @IsString()
  filename!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(127)
  mimeType!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}
