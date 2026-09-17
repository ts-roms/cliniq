import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RescheduleAppointmentDto {
  @ApiProperty({ description: 'ISO 8601' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ description: 'ISO 8601' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional({
    description: 'Move to another provider. Defaults to the current one.',
  })
  @IsOptional()
  @IsString()
  providerId?: string;
}

export class CancelAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class NoShowSweepDto {
  @ApiPropertyOptional({
    description:
      'Mark SCHEDULED appointments whose slot ended more than this many minutes ago. Defaults to APPT_NOSHOW_GRACE_MINUTES.',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  graceMinutes?: number;
}
