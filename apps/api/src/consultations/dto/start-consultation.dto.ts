import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StartConsultationDto {
  @ApiPropertyOptional({
    description:
      'Patient id. Required unless appointmentId is given (then it must match).',
  })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({
    description:
      'Open the consult from a booked slot: the appointment moves to IN_PROGRESS and completes with the consult.',
  })
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiPropertyOptional({
    description:
      'What this consult is for (VisitType id). Ignored when appointmentId is ' +
      'given and that appointment already carries one — the booking wins.',
  })
  @IsOptional()
  @IsString()
  visitTypeId?: string;

  @ApiPropertyOptional({
    description:
      'The attending clinician (an active OWNER, DOCTOR or NURSE of this ' +
      'clinic), recorded as the provider. Defaults to the caller; REQUIRED ' +
      'when the caller cannot write consults (ADMIN).',
  })
  @IsOptional()
  @IsString()
  providerId?: string;
}
