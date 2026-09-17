import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WeeklyRangeDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0=Sunday … 6=Saturday' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ description: 'HH:mm 24h in the tenant timezone' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'HH:mm 24h' })
  startTime!: string;

  @ApiProperty({ description: 'HH:mm 24h, exclusive' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'HH:mm 24h' })
  endTime!: string;

  @ApiPropertyOptional({ default: 30, minimum: 5, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  slotMinutes?: number;
}

/** Replaces the provider's weekly schedule wholesale. Empty array = "no rules" (falls back to clinic hours). */
export class SetWeeklyScheduleDto {
  @ApiProperty({ type: [WeeklyRangeDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WeeklyRangeDto)
  ranges!: WeeklyRangeDto[];
}

export class CreateTimeOffDto {
  @ApiProperty({ description: 'ISO 8601' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ description: 'ISO 8601, exclusive' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class SlotsQueryDto {
  @ApiProperty({
    description: 'Local calendar date, YYYY-MM-DD (tenant timezone)',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'YYYY-MM-DD' })
  date!: string;

  @ApiPropertyOptional({
    description: "Slot length; defaults to each range's slotMinutes",
    minimum: 5,
    maximum: 480,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;
}
