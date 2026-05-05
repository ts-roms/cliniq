import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GenerateSoapDto {
  @ApiProperty({ description: 'Raw transcript (audio STT or typed)' })
  @IsString()
  @MinLength(20, { message: 'transcript too short' })
  transcript!: string;
}
