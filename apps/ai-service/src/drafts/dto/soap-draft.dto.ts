import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

class PatientContext {
  @ApiPropertyOptional() @IsOptional() @IsInt() age?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() sex?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() allergies?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() activeMedications?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() activeConditions?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() chiefComplaint?: string;
}

export class SoapDraftRequestDto {
  @ApiProperty()
  @IsString()
  consultationId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(20, { message: 'transcript too short' })
  transcript!: string;

  @ApiProperty({ type: PatientContext })
  @IsObject()
  patientContext!: PatientContext;
}

export class SoapDraftResponseDto {
  @ApiProperty() draft!: Record<string, unknown>;
  @ApiProperty() promptVersion!: string;
  @ApiProperty() model!: string;
  @ApiProperty() inputTokens!: number;
  @ApiProperty() outputTokens!: number;
  @ApiProperty() cacheReadTokens!: number;
  @ApiProperty() latencyMs!: number;
}
