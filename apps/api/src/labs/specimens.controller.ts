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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { SpecimenStatus } from '@org/db';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { SpecimensService } from './specimens.service.js';
import {
  CollectSpecimenDto,
  ReceiveSpecimenDto,
  RejectSpecimenDto,
  TransitionSpecimenDto,
} from './dto/specimens.dto.js';

/**
 * Specimen handling.
 *
 * Gated on CONSULT_WRITE, which DOCTOR, NURSE and OWNER hold: collecting,
 * receiving and rejecting are clinical-operational acts, not administration.
 * RECEPTIONIST is excluded because none of these are front-desk work.
 *
 * These will move to dedicated MEDICAL_TECHNOLOGIST / LAB_RECEPTION actions
 * when the verification chain lands — that is the slice where separation of
 * duties actually bites, because that is where someone signs for a result.
 * Introducing lab roles here, with nothing yet to separate, would be
 * ceremony.
 *
 * Every state-changing route is audited: who drew it, who received it, who
 * rejected it and why is exactly the chain an inspection follows.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis')
export class SpecimensController {
  constructor(private readonly specimens: SpecimensService) {}

  @Get('specimens')
  @Requires(Actions.CONSULT_READ)
  // `enumName` is not decoration: without it Swagger tries to introspect the
  // Prisma-generated enum (a plain const object) as a model to inline, and
  // the API refuses to boot with "circular dependency detected (property
  // key: ORDERED)". Naming it registers a reusable schema instead — which is
  // also what platform-tenants.controller.ts does for TenantStatus.
  @ApiQuery({
    name: 'status',
    required: false,
    enum: SpecimenStatus,
    enumName: 'SpecimenStatus',
  })
  @ApiQuery({ name: 'orderId', required: false })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: SpecimenStatus,
    @Query('orderId') orderId?: string,
  ) {
    return this.specimens.list(user, { status, orderId });
  }

  @Get('specimens/:id')
  @Requires(Actions.CONSULT_READ)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.specimens.detail(id, user);
  }

  /** Collect against an order; allocates the accession number. */
  @Post('orders/:orderId/specimens')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lis.specimenCollect',
    entity: 'Specimen',
    entityIdFrom: 'result:id',
  })
  collect(
    @Param('orderId') orderId: string,
    @Body() dto: CollectSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.specimens.collect(orderId, dto, user);
  }

  @Patch('specimens/:id/receive')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lis.specimenReceive',
    entity: 'Specimen',
    entityIdFrom: 'param:id',
  })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.specimens.receive(id, dto, user);
  }

  @Post('specimens/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lis.specimenReject',
    entity: 'Specimen',
    entityIdFrom: 'param:id',
  })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.specimens.reject(id, dto, user);
  }

  @Patch('specimens/:id/status')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lis.specimenTransition',
    entity: 'Specimen',
    entityIdFrom: 'param:id',
  })
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.specimens.transition(id, dto.status, user);
  }
}
