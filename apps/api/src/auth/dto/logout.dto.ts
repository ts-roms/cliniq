import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  /** The refresh token to revoke. Omit to just drop the client-side session. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  refreshToken?: string;
}
