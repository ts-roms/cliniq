import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LabPlanCaseContextDto {
  @ApiPropertyOptional() @IsOptional() refNumber?: number | null;
  @ApiProperty() @IsString() productName!: string;
  @ApiProperty({ enum: ['STANDARD', 'URGENT'] })
  @IsEnum(['STANDARD', 'URGENT'])
  urgency!: 'STANDARD' | 'URGENT';
  @ApiPropertyOptional() @IsOptional() @IsString() patientLabel?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() doctorLabel?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsObject() formData?: Record<string, unknown> | null;
}

export class LabPlanMaterialDto {
  @ApiProperty() @IsString() material!: string;
  @ApiProperty() @IsString() lot!: string;
}

export class LabPlanDraftRequestDto {
  @ApiProperty({ type: LabPlanCaseContextDto })
  @ValidateNested()
  @Type(() => LabPlanCaseContextDto)
  case!: LabPlanCaseContextDto;

  @ApiPropertyOptional({ type: [LabPlanMaterialDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabPlanMaterialDto)
  materialsUsed?: LabPlanMaterialDto[];
}

export class LabPlanDraftResponseDto {
  @ApiProperty({ description: 'Markdown plan summary the lab can edit.' })
  summary!: string;
  @ApiProperty() promptVersion!: string;
  @ApiProperty() model!: string;
  @ApiProperty() inputTokens!: number;
  @ApiProperty() outputTokens!: number;
  @ApiProperty() cacheReadTokens!: number;
  @ApiProperty() latencyMs!: number;
}
