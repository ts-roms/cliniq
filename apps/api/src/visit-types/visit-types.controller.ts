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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { VisitTypesService } from './visit-types.service.js';
import {
  CreateVisitTypeDto,
  UpdateVisitTypeDto,
} from './dto/visit-type.dto.js';

@ApiTags('visit-types')
@ApiBearerAuth('jwt')
@Controller('visit-types')
export class VisitTypesController {
  constructor(private readonly visitTypes: VisitTypesService) {}

  /**
   * Readable by any authenticated staff member: a receptionist books the
   * appointment and a doctor opens the consult, so both need the picker.
   * Managing the catalogue is admin-only below.
   */
  @Get()
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.visitTypes.list(user, {
      includeInactive: includeInactive === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.visitTypes.findById(id, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'visit-type.create',
    entity: 'VisitType',
    entityIdFrom: 'result:id',
  })
  create(
    @Body() dto: CreateVisitTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visitTypes.create(dto, user);
  }

  @Patch(':id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'visit-type.update',
    entity: 'VisitType',
    entityIdFrom: 'param:id',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVisitTypeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visitTypes.update(id, dto, user);
  }

  @Delete(':id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'visit-type.delete',
    entity: 'VisitType',
    entityIdFrom: 'param:id',
  })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.visitTypes.remove(id, user);
  }
}
