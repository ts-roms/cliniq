import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { DrugsService } from './drugs.service.js';

@ApiTags('drugs')
@ApiBearerAuth('jwt')
@Controller('drugs')
export class DrugsController {
  constructor(private readonly drugs: DrugsService) {}

  @Get('search')
  @Requires(Actions.RX_WRITE)
  search(@Query('q') q: string, @CurrentUser() u: AuthenticatedUser) {
    return this.drugs.search(q ?? '', u);
  }
}
