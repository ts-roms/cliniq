import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IcdCodesService } from './icd-codes.service.js';

@ApiTags('icd-codes')
@ApiBearerAuth('jwt')
@Controller('icd-codes')
export class IcdCodesController {
  constructor(private readonly icd: IcdCodesService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.icd.search(q ?? '');
  }
}
