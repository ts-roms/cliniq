import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * A laboratory this clinic sends work to.
 *
 * `dohLtoNumber` is optional here but required before the laboratory can
 * actually be referred to — AO 2021-0037 permits referral only to a licensed
 * laboratory. Optional at this layer so a destination can be drafted while
 * someone goes and finds the number.
 */
export class UpsertReferralLaboratoryDto {
  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: "The destination's own DOH LTO number." })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  dohLtoNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    description: 'Courier or pickup arrangement, as free text.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  courier?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Record a referral leaving, or coming back. */
export class MarkReferralDto {
  @ApiPropertyOptional({
    description: 'When it happened. Defaults to now.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  at?: Date;

  @ApiPropertyOptional({
    description: "The destination's own reference number.",
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(120)
  externalRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  courier?: string;

  @ApiPropertyOptional({
    description:
      'Condition on arrival. A referral laboratory rejecting our specimen is something the ordering doctor needs to know.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  conditionOnArrival?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
