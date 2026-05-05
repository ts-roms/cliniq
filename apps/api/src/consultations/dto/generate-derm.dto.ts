import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class GenerateDermDto {
  @ApiProperty({ description: 'fileIds returned by /api/files/presign + /confirm' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  fileIds!: string[];

  @ApiPropertyOptional({ description: 'Patient-reported complaint for context' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  presentingComplaint?: string;
}
