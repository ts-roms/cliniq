import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DsrStatus, DsrType } from '@org/db';

export class FileDsrDto {
  @ApiProperty() @IsString() patientId!: string;
  @ApiProperty({ enum: DsrType }) @IsEnum(DsrType) type!: DsrType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) details?: string;
}

export class ResolveDsrDto {
  @ApiProperty({ enum: DsrStatus }) @IsEnum(DsrStatus) status!: DsrStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) resolution?: string;
}
