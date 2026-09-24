import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { LaboratoryService } from './laboratory.service.js';
import { SetCapabilityDto, UpsertLaboratoryDto } from './dto/laboratory.dto.js';

/**
 * The laboratory's licence profile and service capability.
 *
 * Writes are `CLINIC_ADMIN`: this is back-office configuration about the
 * facility's licence, not clinical work, and it changes what the laboratory
 * asserts about itself on every report it issues. Reads are `CONSULT_READ`,
 * because anyone placing an order benefits from knowing what can be run
 * in-house.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis/laboratory')
export class LaboratoryController {
  constructor(private readonly laboratory: LaboratoryService) {}

  /** The profile, with licence status computed. Null when not yet recorded. */
  @Get()
  @Requires(Actions.CONSULT_READ)
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.laboratory.get(user);
  }

  @Put()
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.laboratoryUpsert',
    entity: 'Laboratory',
    entityIdFrom: 'result:id',
  })
  upsert(
    @Body() dto: UpsertLaboratoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.laboratory.upsert(dto, user);
  }

  /** Declare a section or a single test as performed (or explicitly not). */
  @Post('capabilities')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.capabilitySet',
    entity: 'LabServiceCapability',
    entityIdFrom: 'result:id',
  })
  setCapability(
    @Body() dto: SetCapabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.laboratory.setCapability(dto, user);
  }

  @Delete('capabilities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.capabilityRemove',
    entity: 'LabServiceCapability',
    entityIdFrom: 'param:id',
  })
  removeCapability(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.laboratory.removeCapability(id, user);
  }
}
