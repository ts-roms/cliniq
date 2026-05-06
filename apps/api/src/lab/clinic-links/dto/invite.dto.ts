import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InviteClinicDto {
  @ApiProperty({
    example: 'demo',
    description:
      'Slug of the clinic tenant to invite. The clinic must already be a CLINIC tenant on the platform; non-tenant email invites land in Phase 2.',
  })
  @IsString()
  @Length(2, 64)
  clinicSlug!: string;

  @ApiPropertyOptional({
    description: 'Optional message shown to the clinic on the invitation card.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inviteNote?: string;
}
