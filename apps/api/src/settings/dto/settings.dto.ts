import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsIn,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_CLINIC_MODULES } from '@org/shared-types';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tagline?: string;
}

/**
 * Whether laboratory results must be released before they reach the chart.
 *
 * Both default off. A single-technologist clinic would otherwise be unable to
 * release any result at all, and results that never reach the ordering doctor
 * are a worse patient-safety problem than self-verification. Who entered and
 * who released is recorded either way — these only decide what is enforced.
 */
export class LabVerificationDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Results land PRELIMINARY and must be verified before the order reports.',
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'The verifier must be someone other than whoever entered the result.',
  })
  @IsOptional()
  @IsBoolean()
  requireSeparateVerifier?: boolean;
}

/**
 * What happens to a test the laboratory is not authorized to perform.
 *
 * Off by default. Turning it on is a statement that the clinic has finished
 * declaring its capability and its send-out destinations — until then,
 * refusing orders would punish an incomplete configuration rather than a
 * real mistake.
 */
export class LabCapabilityDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Refuse an order containing an out-of-scope test that has no referral laboratory on file.',
  })
  @IsOptional()
  @IsBoolean()
  enforce?: boolean;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: BrandingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingDto)
  branding?: BrandingDto;

  @ApiPropertyOptional({ type: LabVerificationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LabVerificationDto)
  labVerification?: LabVerificationDto;

  @ApiPropertyOptional({ type: LabCapabilityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LabCapabilityDto)
  labCapability?: LabCapabilityDto;

  @ApiPropertyOptional({ type: [OperatingHourDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperatingHourDto)
  operatingHours?: OperatingHourDto[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'PaymentMethod values: CASH, GCASH, MAYA, BANK_TRANSFER, CARD, HMO, INSURANCE, OTHER',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedPaymentMethods?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  defaultInvoiceNotes?: string;

  @ApiPropertyOptional({
    description: 'PH VAT %; 12 typical, 0 for VAT-exempt',
  })
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
  // Shape-only. Whether the host is actually reachable/public is decided at
  // dispatch time by WebhooksService (see apps/api/src/webhooks/webhook-target.ts),
  // because DNS can change between saving the setting and firing the event.
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_tld: false,
    },
    { message: 'appointmentWebhookUrl must be an absolute http(s) URL' },
  )
  appointmentWebhookUrl?: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: ALL_CLINIC_MODULES,
    description:
      'Clinical modules this clinic practises. Omit to keep whatever is ' +
      'stored; send an explicit array (including []) to set it. Unset falls ' +
      'back to the defaults for the tenant type. The plan narrows the result ' +
      'but never widens it.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_CLINIC_MODULES, { each: true })
  modules?: string[];

  @ApiPropertyOptional({
    description: 'Free-form key/value extension; merged shallowly',
  })
  @IsOptional()
  @IsObject()
  extras?: Record<string, unknown>;
}
