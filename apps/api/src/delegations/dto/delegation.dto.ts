import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDelegationDto {
  @ApiProperty({ description: 'User receiving the delegation (assistant/secretary)' })
  @IsString()
  delegateeId!: string;

  @ApiProperty({ description: 'Window start (ISO datetime)' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ description: 'Window end (ISO datetime)' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Empty = full proxy. Otherwise list of Action strings to permit.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  scope?: string[];
}
