import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DentalLabCaseDisputeKind, DentalLabCaseDisputeStatus } from '@org/db';

export class OpenDisputeDto {
  @ApiProperty({ description: 'Case the dispute attaches to.' })
  @IsString()
  caseId!: string;

  @ApiProperty({
    enum: DentalLabCaseDisputeKind,
    enumName: 'DentalLabCaseDisputeKind',
  })
  @IsEnum(DentalLabCaseDisputeKind)
  kind!: DentalLabCaseDisputeKind;

  @ApiProperty({ description: 'Why the dispute is being opened.' })
  @IsString()
  @Length(1, 4000)
  reason!: string;
}

export class ResolveDisputeDto {
  @ApiProperty({
    enum: [
      DentalLabCaseDisputeStatus.RESOLVED,
      DentalLabCaseDisputeStatus.REJECTED,
      DentalLabCaseDisputeStatus.WITHDRAWN,
    ],
    enumName: 'DentalLabCaseDisputeStatus',
  })
  @IsEnum(DentalLabCaseDisputeStatus)
  status!: DentalLabCaseDisputeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class DisputeMessageDto {
  @ApiProperty()
  @IsString()
  @Length(1, 4000)
  body!: string;
}
