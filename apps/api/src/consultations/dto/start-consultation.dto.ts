import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class StartConsultationDto {
  @ApiProperty({ description: 'Patient id' })
  @IsString()
  patientId!: string;
}
