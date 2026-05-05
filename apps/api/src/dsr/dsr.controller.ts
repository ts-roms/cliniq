import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DsrStatus } from '@org/db';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { DsrService } from './dsr.service.js';
import { FileDsrDto, ResolveDsrDto } from './dto/dsr.dto.js';

@ApiTags('dsr')
@ApiBearerAuth('jwt')
@Controller('dsr')
export class DsrController {
  constructor(private readonly dsr: DsrService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'dsr.file', entity: 'DataSubjectRequest', entityIdFrom: 'result:id' })
  file(@Body() dto: FileDsrDto, @CurrentUser() user: AuthenticatedUser) {
    return this.dsr.file(dto, user);
  }

  @Get()
  @Requires(Actions.AUDIT_READ)
  list(@Query('status') status: DsrStatus | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.dsr.list(user, status);
  }

  @Patch(':id/resolve')
  @Requires(Actions.AUDIT_READ)
  @Audit({ action: 'dsr.resolve', entity: 'DataSubjectRequest', entityIdFrom: 'param:id' })
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDsrDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dsr.resolve(id, dto, user);
  }
}
