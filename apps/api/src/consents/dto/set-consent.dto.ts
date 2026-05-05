import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ConsentTypeDto {
  TREATMENT = 'TREATMENT',
  AI_PROCESSING = 'AI_PROCESSING',
  REMINDERS = 'REMINDERS',
  MARKETING = 'MARKETING',
  RESEARCH = 'RESEARCH',
}

export class SetConsentDto {
  @ApiProperty({ enum: ConsentTypeDto })
  @IsEnum(ConsentTypeDto)
  type!: ConsentTypeDto;

  @ApiProperty()
  @IsBoolean()
  granted!: boolean;

  @ApiPropertyOptional({ description: 'Required when withdrawing a previously granted consent' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  withdrawalReason?: string;

  @ApiPropertyOptional({ default: 'v1' })
  @IsOptional()
  @IsString()
  version?: string;
}
