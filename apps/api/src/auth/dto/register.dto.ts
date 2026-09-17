import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  tenantSlug!: string;

  /** Opaque token from a staff invite email (POST /members/invites). */
  @ApiPropertyOptional({
    description:
      'Token from a staff invite link. Exactly one of inviteToken / bootstrapToken.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  inviteToken?: string;

  /**
   * One-shot JWT returned by POST /tenants when the tenant was created
   * without an owner password. Registers the first OWNER. Exactly one of
   * inviteToken / bootstrapToken must be present.
   */
  @ApiPropertyOptional({
    description:
      'One-shot token from POST /tenants (password-less create). Registers the first OWNER.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  bootstrapToken?: string;
}
