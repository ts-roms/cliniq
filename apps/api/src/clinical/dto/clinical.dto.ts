import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AllergyType, ConditionStatus, MedStatus, Severity } from '@org/db';

export class CreateAllergyDto {
  @ApiProperty() @IsString() @MaxLength(80) substance!: string;
  @ApiProperty({ enum: AllergyType }) @IsEnum(AllergyType) type!: AllergyType;
  @ApiProperty({ enum: Severity }) @IsEnum(Severity) severity!: Severity;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reaction?: string;
}

export class CreateMedicationDto {
  @ApiProperty() @IsString() @MaxLength(80) drugName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) dose?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) frequency?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() startedOn?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() stoppedOn?: Date;
  @ApiPropertyOptional({ enum: MedStatus }) @IsOptional() @IsEnum(MedStatus) status?: MedStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) notes?: string;
}

export class CreateConditionDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) icd10Code?: string;
  @ApiPropertyOptional({ enum: ConditionStatus })
  @IsOptional() @IsEnum(ConditionStatus) status?: ConditionStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() diagnosedOn?: Date;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) notes?: string;
}

export class CreateVitalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() consultationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(40) @Max(260) systolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(20) @Max(180) diastolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(20) @Max(250) heartRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(4) @Max(80) respRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(25) @Max(45) tempC?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(50) @Max(100) spo2?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.5) @Max(400) weightKg?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(20) @Max(250) heightCm?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10) painScore?: number;
}
