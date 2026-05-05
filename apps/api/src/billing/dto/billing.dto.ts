import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@org/db';

export class InvoiceItemInputDto {
  @ApiPropertyOptional() @IsOptional() @IsString() serviceId?: string;
  @ApiProperty() @IsString() @MaxLength(200) description!: string;
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @ApiProperty({ description: 'Unit price in centavos' })
  @Type(() => Number) @IsInt() @Min(0) unitPriceCentavos!: number;
}

export class CreateInvoiceDto {
  @ApiProperty() @IsString() patientId!: string;
  @ApiPropertyOptional({ description: 'Discount in centavos' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) discountCentavos?: number;
  @ApiPropertyOptional({ description: 'Tax in centavos' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) taxCentavos?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) notes?: string;
  @ApiProperty({ type: [InvoiceItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemInputDto)
  items!: InvoiceItemInputDto[];
}

export class RecordPaymentDto {
  @ApiProperty({ description: 'Amount in centavos' })
  @Type(() => Number) @IsInt() @Min(1) amountCentavos!: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method!: PaymentMethod;
  @ApiPropertyOptional({ description: 'Gateway / OR reference' })
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
}

export class CreateServiceDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) category?: string;
  @ApiProperty({ description: 'Price in centavos' })
  @Type(() => Number) @IsInt() @Min(0) priceCentavos!: number;
}
