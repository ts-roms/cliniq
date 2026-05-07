import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabInvoiceStatus, LabPaymentLinkProvider } from '@org/db';

/**
 * Single line item on a lab invoice. Either tied to a case (auto-generated
 * from a delivered LabCase) or free-form (custom service / discount /
 * adjustment). Money is in centavos.
 */
export class InvoiceItemInputDto {
  @ApiPropertyOptional({ description: 'Optional LabCase id this line bills for.' })
  @IsOptional()
  @IsString()
  caseId?: string;

  @ApiProperty({ example: 'Crown — case #142' })
  @IsString()
  @Length(1, 500)
  description!: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  qty?: number;

  @ApiProperty({ description: 'Unit price in centavos.', example: 250000 })
  @IsInt()
  @Min(0)
  unitPriceCents!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ description: 'Clinic tenant id this invoice is billed to.' })
  @IsString()
  clinicTenantId!: string;

  @ApiPropertyOptional({ default: 'PHP' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 due date.' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Tax in centavos (line-total agnostic).', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  taxCents?: number;

  @ApiPropertyOptional({ type: [InvoiceItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInputDto)
  items?: InvoiceItemInputDto[];
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  taxCents?: number;
}

export class GenerateFromCasesDto {
  @ApiProperty({ description: 'Clinic tenant id. All cases must belong to this clinic.' })
  @IsString()
  clinicTenantId!: string;

  @ApiProperty({ type: [String], description: 'LabCase ids to bill.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  caseIds!: string[];

  @ApiPropertyOptional({ default: 'PHP' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  taxCents?: number;
}

export class AddInvoiceItemDto extends InvoiceItemInputDto {}

export class UpdateInvoiceItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  qty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class RecordPaymentDto {
  @ApiProperty({ description: 'Amount paid in centavos. Adds to paidCents.' })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiPropertyOptional({ description: 'ISO 8601 timestamp of the payment.' })
  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @ApiPropertyOptional({ description: 'Free-text reference (bank ref, link id, etc.).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reference?: string;
}

export class CreatePaymentLinkDto {
  @ApiPropertyOptional({
    enum: LabPaymentLinkProvider,
    enumName: 'LabPaymentLinkProvider',
    default: LabPaymentLinkProvider.MANUAL,
  })
  @IsOptional()
  @IsEnum(LabPaymentLinkProvider)
  provider?: LabPaymentLinkProvider;

  @ApiPropertyOptional({ description: 'Amount in centavos. Defaults to invoice outstanding balance.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @ApiPropertyOptional({ description: 'External provider id (PayMongo link id, etc.).' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalId?: string;

  @ApiPropertyOptional({ description: 'Public-facing URL the payer follows.' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 expiry.' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class InvoiceFilterDto {
  @ApiPropertyOptional({ enum: LabInvoiceStatus, enumName: 'LabInvoiceStatus' })
  @IsOptional()
  @IsEnum(LabInvoiceStatus)
  status?: LabInvoiceStatus;

  @ApiPropertyOptional({ description: 'Filter to a specific clinic (lab-side only).' })
  @IsOptional()
  @IsString()
  clinicTenantId?: string;
}
