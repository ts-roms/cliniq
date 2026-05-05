import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabAbnormalFlag, LabOrderStatus } from '@org/db';

export class LabOrderItemInputDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) testCode?: string;
  @ApiProperty() @IsString() @MaxLength(120) testName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) resultUnit?: string;

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
}

export class CreateLabOrderDto {
  @ApiProperty() @IsString() patientId!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() consultationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) vendor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) externalRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) notes?: string;

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

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) vendor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) externalRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) notes?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() collectedAt?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() receivedAt?: Date;
}

export class RecordResultDto {
  @ApiProperty() @IsString() resultValue!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) resultUnit?: string;

  @ApiPropertyOptional({ enum: LabAbnormalFlag })
  @IsOptional()
  @IsEnum(LabAbnormalFlag)
  abnormalFlag?: LabAbnormalFlag;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) comment?: string;
}
