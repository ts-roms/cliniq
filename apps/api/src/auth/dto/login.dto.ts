import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  // Optional second factor for MFA-enabled accounts. When the user has MFA
  // on and this field is missing/wrong, the API returns 401 with
  // { mfaRequired: true } so the client can render the code prompt.
  @ApiPropertyOptional({ description: '6-digit TOTP code or hex backup code' })
  @IsOptional()
  @IsString()
  mfaCode?: string;
}
