import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty()
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({ description: 'Markdown body with {{placeholder}} support.' })
  @IsString()
  @Length(1, 50_000)
  body!: string;

  @ApiPropertyOptional({ description: 'Attach to a specific product. Null = generic.' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 50_000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CaptureSignatureDto {
  @ApiProperty()
  @IsString()
  templateId!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  signedByName!: string;

  @ApiPropertyOptional({ example: 'patient' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  signedByRole?: string;

  @ApiProperty({ description: 'S3 key of the uploaded signature image.' })
  @IsString()
  signatureFileKey!: string;
}
