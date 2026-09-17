import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabCaseDisputeKind, LabCaseDisputeStatus } from '@org/db';

export class OpenDisputeDto {
  @ApiProperty({ description: 'Case the dispute attaches to.' })
  @IsString()
  caseId!: string;

  @ApiProperty({ enum: LabCaseDisputeKind, enumName: 'LabCaseDisputeKind' })
  @IsEnum(LabCaseDisputeKind)
  kind!: LabCaseDisputeKind;

  @ApiProperty({ description: 'Why the dispute is being opened.' })
  @IsString()
  @Length(1, 4000)
  reason!: string;
}

export class ResolveDisputeDto {
  @ApiProperty({
    enum: [LabCaseDisputeStatus.RESOLVED, LabCaseDisputeStatus.REJECTED, LabCaseDisputeStatus.WITHDRAWN],
    enumName: 'LabCaseDisputeStatus',
  })
  @IsEnum(LabCaseDisputeStatus)
  status!: LabCaseDisputeStatus;

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
