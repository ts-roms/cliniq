import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Self-service edits a staff member can make to their own User row. The
 * PRC fields are what prescriptions.service checks before issuing an Rx —
 * without them a DOCTOR gets "PRC license number missing on your profile".
 * Every field is optional; `null` clears an optional value.
 */
export class UpdateStaffProfileDto {
  @ApiPropertyOptional({ example: 'Dr. Juana Cruz' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({
    description: 'PRC licence number (digits, 4-10). null clears it.',
    example: '0123456',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,10}$/, { message: 'prcLicenseNumber must be 4-10 digits' })
  prcLicenseNumber?: string | null;

  @ApiPropertyOptional({
    description: 'PRC licence expiry (ISO date). null clears it.',
    example: '2028-12-31',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsISO8601({ strict: true })
  prcLicenseExpiry?: string | null;

  @ApiPropertyOptional({
    example: 'General Medicine',
    nullable: true,
    type: String,
  })
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  prcSpecialty?: string | null;
}
