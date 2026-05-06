import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PlatformLoginDto {
  @ApiProperty({ example: 'platform@cliniq.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, description: 'TOTP code if MFA is enrolled' })
  @IsOptional()
  @IsString()
  mfaCode?: string;
}

export class PlatformRefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
