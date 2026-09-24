import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CriticalNotificationMethod } from '@org/db';

export class AcknowledgeCriticalResultDto {
  @ApiPropertyOptional({
    enum: CriticalNotificationMethod,
    description:
      'How the result was actually communicated. Defaults to how it was raised (IN_APP); set PHONE when the laboratory telephoned it.',
  })
  @IsOptional()
  @IsEnum(CriticalNotificationMethod)
  method?: CriticalNotificationMethod;

  @ApiPropertyOptional({
    description:
      "Read-back — what the clinician repeated back, e.g. 'Potassium 6.8, repeat sent, patient recalled'. This is the evidence an inspection asks for.",
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  note?: string;
}
