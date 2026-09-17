import { IsHexColor, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty()
  @IsString()
  @Length(1, 64)
  name!: string;

  /** 6-digit hex without leading "#". */
  @ApiPropertyOptional({ example: 'f59e0b' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F]{6}$/, { message: 'color must be 6-digit hex (no #)' })
  color?: string;
}

export class UpdateTagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-fA-F]{6}$/, { message: 'color must be 6-digit hex (no #)' })
  color?: string;
}

export class AssignTagDto {
  @ApiProperty()
  @IsString()
  tagId!: string;
}
