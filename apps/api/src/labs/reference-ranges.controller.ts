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
import { Features } from '@org/shared-types';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { ReferenceRangesService } from './reference-ranges.service.js';
import {
  CreateReferenceRangeDto,
  UpdateReferenceRangeDto,
} from './dto/reference-ranges.dto.js';

/**
 * The laboratory's configured reference intervals.
 *
 * Permissions match the critical-value rules exactly, and for the same reason:
 * reads are open to anyone who can read a consult, so a clinician looking at a
 * flagged result can see the interval that produced it, and writes are
 * CLINIC_ADMIN because deciding what counts as normal is a governance decision
 * rather than a day-to-day one.
 *
 * Every write is audited.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis/reference-ranges')
export class ReferenceRangesController {
  constructor(private readonly ranges: ReferenceRangesService) {}

  @Get()
  @Requires(Actions.CONSULT_READ)
  @ApiQuery({ name: 'includeExpired', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeExpired') includeExpired?: string,
  ) {
    return this.ranges.list(user, {
      includeExpired: includeExpired === 'true',
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lab.referenceRangeCreate',
    entity: 'ReferenceRange',
    entityIdFrom: 'result:id',
  })
  create(
    @Body() dto: CreateReferenceRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ranges.create(dto, user);
  }

  @Patch(':id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lab.referenceRangeUpdate',
    entity: 'ReferenceRange',
    entityIdFrom: 'param:id',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReferenceRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ranges.update(id, dto, user);
  }

  @Delete(':id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lab.referenceRangeRetire',
    entity: 'ReferenceRange',
    entityIdFrom: 'param:id',
  })
  retire(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ranges.retire(id, user);
  }
}
