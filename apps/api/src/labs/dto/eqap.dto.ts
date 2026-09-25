import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** An EQAP scheme operator — NRL, RIQAS, CAP and so on. */
export class UpsertEqapProviderDto {
  @ApiProperty()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(160)
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  website?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Participation in one programme. */
export class UpsertEqapEnrolmentDto {
  @ApiProperty() @IsString() providerId!: string;

  @ApiProperty({ description: 'The scheme name as the provider calls it.' })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  programme!: string;

  @ApiPropertyOptional({
    description:
      'The participant number. This is what an inspector matches against the certificate on the wall.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  enrolmentNumber?: string;

  @ApiPropertyOptional({ description: 'The LabSection this programme covers.' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validFrom?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;
}

/** What we sent for a survey round. */
export class SubmitEqapRoundDto {
  @ApiProperty() @IsString() enrolmentId!: string;

  @ApiProperty({ description: "The provider's identifier for this round." })
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  roundRef!: string;

  @ApiPropertyOptional({
    description: 'The analyte. Omit for a whole-panel survey.',
  })
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueOn?: Date;

  @ApiPropertyOptional({ description: 'Defaults to now.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  submittedAt?: Date;

  @ApiPropertyOptional({ description: 'The value we reported.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  reportedValue?: number;
}

/**
 * What the provider sent back.
 *
 * Either give the SDI directly, or give the peer mean and SD and it is
 * derived. Both are accepted because providers report differently, and
 * deriving one from the other when only one is available would invent
 * precision that is not there.
 */
export class RecordEqapResultDto {
  @ApiPropertyOptional({ description: 'Standard deviation index, if given.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sdi?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  peerMean?: number;

  @ApiPropertyOptional({ description: 'Must be greater than zero.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  peerSd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  reportedValue?: number;

  @ApiPropertyOptional({
    description:
      "The provider's report, as a FileObject id. This is the evidence an inspection asks for.",
  })
  @IsOptional()
  @IsString()
  reportFileId?: string;

  @ApiPropertyOptional({
    description:
      'What was done about an unacceptable result. Its absence against a failure is the finding.',
  })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000)
  correctiveAction?: string;
}
