import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, Matches, MinLength } from 'class-validator';

export class RegisterPatientDto {
  @ApiProperty({ description: 'Tenant slug from clinic invite' })
  @IsString()
  @MinLength(3)
  tenantSlug!: string;

  @ApiProperty({ description: 'MRN printed on patient ID/invite' })
  @IsString()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'MRN: letters, digits, hyphens only' })
  mrn!: string;

  @ApiProperty({ description: 'Must match the email on file' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
