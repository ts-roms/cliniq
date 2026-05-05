import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { LocationsService } from './locations.service.js';
import {
  CreateLocationDto,
  UpdateLocationDto,
} from './dto/location.dto.js';

@ApiTags('locations')
@ApiBearerAuth('jwt')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  // Reading the location list is needed by every authenticated user (the
  // primary location's name appears on Rx/invoice headers); no extra gate.
  list(@CurrentUser() u: AuthenticatedUser) {
    return this.locations.list(u);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'location.create', entity: 'Location', entityIdFrom: 'result:id' })
  create(@Body() dto: CreateLocationDto, @CurrentUser() u: AuthenticatedUser) {
    return this.locations.create(dto, u);
  }

  @Patch(':id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'location.update', entity: 'Location', entityIdFrom: 'param:id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.locations.update(id, dto, u);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'location.delete', entity: 'Location', entityIdFrom: 'param:id' })
  remove(@Param('id') id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.locations.remove(id, u);
  }
}
