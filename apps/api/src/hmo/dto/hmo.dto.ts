import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HmoClaimStatus } from '@org/db';

export class CreateHmoProviderDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) payerCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() contactEmail?: string;
}

export class CreateHmoMembershipDto {
  @ApiProperty() @IsString() providerId!: string;
  @ApiProperty() @IsString() @MaxLength(80) memberId!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() validFrom?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() validUntil?: Date;
}

export class FileClaimDto {
  @ApiProperty() @IsString() membershipId!: string;
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  claimedCentavos!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) notes?: string;
}

export class UpdateClaimDto {
  @ApiPropertyOptional({ enum: HmoClaimStatus, enumName: 'HmoClaimStatus' })
  @IsOptional()
  @IsEnum(HmoClaimStatus)
  status?: HmoClaimStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) authNumber?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  approvedCentavos?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  patientResponsibilityCentavos?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) denialReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) notes?: string;
}

export class RecordHmoPaymentDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCentavos!: number;

  @ApiPropertyOptional({ description: 'HMO payment reference (PRA, voucher #)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

export class UpdateProviderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) payerCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
