import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OperatingHourDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0=Sunday, 6=Saturday' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ description: 'HH:mm 24h, e.g. 08:30' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'HH:mm 24h' })
  open!: string;

  @ApiProperty({ description: 'HH:mm 24h' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'HH:mm 24h' })
  close!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class BrandingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'CSS hex e.g. #1f6feb' })
  primaryColor?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) tagline?: string;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: BrandingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingDto)
  branding?: BrandingDto;

  @ApiPropertyOptional({ type: [OperatingHourDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperatingHourDto)
  operatingHours?: OperatingHourDto[];

  @ApiPropertyOptional({
    type: [String],
    description: 'PaymentMethod values: CASH, GCASH, MAYA, BANK_TRANSFER, CARD, HMO, INSURANCE, OTHER',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedPaymentMethods?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) defaultInvoiceNotes?: string;

  @ApiPropertyOptional({ description: 'PH VAT %; 12 typical, 0 for VAT-exempt' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  vatPercent?: number;

  @ApiPropertyOptional({
    description:
      'HTTPS URL to receive POST events on appointment lifecycle (create / check-in / cancel). Use Zapier/Make/n8n to bridge into Google or Microsoft Calendar.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  appointmentWebhookUrl?: string;

  @ApiPropertyOptional({ description: 'Free-form key/value extension; merged shallowly' })
  @IsOptional()
  @IsObject()
  extras?: Record<string, unknown>;
}
