import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeleSignalKind } from '@org/db';

export class CreateSessionDto {
  @ApiProperty() @IsString() patientId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() appointmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() consultationId?: string;
}

export class JoinSessionDto {
  @ApiProperty({ description: 'joinToken from session create response' })
  @IsString()
  joinToken!: string;
}

export class PostSignalDto {
  @ApiProperty({ enum: TeleSignalKind })
  @IsEnum(TeleSignalKind)
  kind!: TeleSignalKind;

  @ApiProperty({ description: 'Opaque signaling payload (SDP, ICE candidate, chat text)' })
  @IsObject()
  payload!: Record<string, unknown>;
}
