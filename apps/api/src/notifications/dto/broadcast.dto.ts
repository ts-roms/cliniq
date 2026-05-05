import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationSeverity } from '@org/db';

const ROLES = [
  'OWNER',
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'PATIENT',
] as const;
type Role = (typeof ROLES)[number];

export class BroadcastDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;

  @ApiPropertyOptional({ enum: NotificationSeverity, default: NotificationSeverity.INFO })
  @IsOptional()
  @IsEnum(NotificationSeverity)
  severity?: NotificationSeverity;

  @ApiPropertyOptional({
    type: [String],
    description: 'Recipient roles. Omit / empty = all staff (no PATIENT).',
    enum: ROLES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ROLES, { each: true })
  roles?: Role[];

  @ApiPropertyOptional({ description: 'Optional in-app link, e.g. /admin/dsr' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  link?: string;
}
