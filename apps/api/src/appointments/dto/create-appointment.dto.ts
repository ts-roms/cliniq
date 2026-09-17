import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus, AppointmentType } from '@org/db';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiProperty()
  @IsString()
  providerId!: string;

  @ApiProperty({ description: 'ISO 8601' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ description: 'ISO 8601' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional({
    enum: AppointmentType,
    default: AppointmentType.CONSULT,
  })
  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description:
      "Book outside the provider's hours / during time off anyway (front-desk override; audited). Double-booking is never overridable.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class AppointmentRangeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
