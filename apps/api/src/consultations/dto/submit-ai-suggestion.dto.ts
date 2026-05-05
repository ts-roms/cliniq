import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export enum AiSuggestionDecision {
  ACCEPT = 'ACCEPT',
  EDIT_ACCEPT = 'EDIT_ACCEPT',
  REJECT = 'REJECT',
}

export class DecideAiSuggestionDto {
  @ApiProperty({ enum: AiSuggestionDecision })
  @IsEnum(AiSuggestionDecision)
  decision!: AiSuggestionDecision;

  @ApiPropertyOptional({ description: 'Final edited content if decision is EDIT_ACCEPT' })
  @IsOptional()
  @IsObject()
  editedContent?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Edit distance vs original draft' })
  @IsOptional()
  @IsString()
  editSummary?: string;
}
