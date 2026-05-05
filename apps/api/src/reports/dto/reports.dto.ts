import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReportRangeDto {
  @ApiPropertyOptional({ description: 'ISO 8601, defaults to 30 days ago' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO 8601, defaults to now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class TopServicesDto extends ReportRangeDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
