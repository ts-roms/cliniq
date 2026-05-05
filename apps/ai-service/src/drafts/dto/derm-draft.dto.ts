import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

class DermPatientContext {
  @ApiPropertyOptional() @IsOptional() @IsInt() age?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sex?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() allergies?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() presentingComplaint?: string;
}

export class DermDraftRequestDto {
  @ApiProperty()
  @IsString()
  consultationId!: string;

  @ApiProperty({ type: [String], description: 'S3 keys for the captured images' })
  @IsArray()
  @IsString({ each: true })
  imageS3Keys!: string[];

  @ApiProperty({ type: DermPatientContext })
  @IsObject()
  patientContext!: DermPatientContext;

  @ApiPropertyOptional({ minimum: 1, maximum: 8, default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  maxImages?: number;
}
