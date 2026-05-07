import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QueueKind, QueueTicketStatus } from '@org/db';

export class CreateQueueDto {
  @ApiPropertyOptional({ description: 'Optional location id this queue is bound to.' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ enum: QueueKind, enumName: 'QueueKind' })
  @IsOptional()
  @IsEnum(QueueKind)
  kind?: QueueKind;

  @ApiPropertyOptional({ description: 'Display name shown on the public TV.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ description: 'Number prefix, e.g. "A" → "A-001".', default: 'A' })
  @IsOptional()
  @IsString()
  @Length(1, 4)
  numberPrefix?: string;
}

export class UpdateQueueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 4)
  numberPrefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class IssueTicketDto {
  @ApiProperty({ description: 'Queue id this ticket belongs to.' })
  @IsString()
  queueId!: string;

  @ApiPropertyOptional({ description: 'Patient id if the patient is registered.' })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Free-text label for unidentified walk-ins.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({ description: 'Phone for SMS notifications.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Soft priority: PRIORITY queues default to 100; pass to override.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class TicketActionDto {
  @ApiProperty({ enum: QueueTicketStatus, enumName: 'QueueTicketStatus' })
  @IsEnum(QueueTicketStatus)
  status!: QueueTicketStatus;
}
