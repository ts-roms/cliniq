import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Plan, TenantStatus, ClinicType } from '@org/db';

export class UpdateTenantDto {
  @ApiPropertyOptional({ enum: Plan })
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ description: 'ISO 8601; null clears the trial' })
  @IsOptional()
  @IsISO8601()
  trialEndsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
}

export class CreateTenantDto {
  @ApiProperty({ example: 'sunrise-clinic' })
  @IsString()
  @Length(2, 64)
  slug!: string;

  @ApiProperty({ example: 'Sunrise Family Clinic' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional({ enum: ClinicType })
  @IsOptional()
  @IsEnum(ClinicType)
  type?: ClinicType;

  @ApiPropertyOptional({ enum: Plan, default: Plan.STARTER })
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @ApiPropertyOptional({
    description: 'Initial owner user. If omitted, the tenant is created without users — invite owner separately via the regular /api/auth/register flow once the slug is known.',
  })
  @IsOptional()
  ownerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  ownerName?: string;

  @ApiPropertyOptional({ description: 'Initial password for the owner; omit to require a password-reset flow' })
  @IsOptional()
  ownerPassword?: string;
}
