import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  // Mobile passes the refresh token in the body. The web client passes nothing
  // — the controller pulls the token from the httpOnly `cliniq.refresh` cookie
  // before handing the DTO to the service. `@IsOptional` keeps validation
  // happy when the body is `{}`.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken!: string;
}
