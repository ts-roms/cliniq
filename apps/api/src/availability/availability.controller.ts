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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { AvailabilityService } from './availability.service.js';
import {
  CreateTimeOffDto,
  SetWeeklyScheduleDto,
  SlotsQueryDto,
} from './dto/availability.dto.js';

/**
 * Reads need PATIENT_READ (front desk books against them). Writes are
 * gated in the service: OWNER/ADMIN for anyone, a provider for themselves.
 */
@ApiTags('availability')
@ApiBearerAuth('jwt')
@Controller('providers')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  /** Bookable staff (OWNER / DOCTOR / NURSE) for pickers. */
  @Get()
  @Requires(Actions.PATIENT_READ)
  listProviders(@CurrentUser() user: AuthenticatedUser) {
    return this.availability.listProviders(user);
  }

  @Get(':providerId/availability')
  @Requires(Actions.PATIENT_READ)
  get(
    @Param('providerId') providerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.availability.get(providerId, user);
  }

  @Get(':providerId/availability/slots')
  @Requires(Actions.PATIENT_READ)
  slots(
    @Param('providerId') providerId: string,
    @Query() q: SlotsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.availability.slots(providerId, q, user);
  }

  @Put(':providerId/availability/schedule')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'availability.setSchedule', entity: 'User' })
  setWeekly(
    @Param('providerId') providerId: string,
    @Body() dto: SetWeeklyScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.availability.setWeekly(providerId, dto, user);
  }

  @Post(':providerId/availability/time-off')
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    action: 'availability.timeOffAdd',
    entity: 'ProviderTimeOff',
    entityIdFrom: 'result:id',
  })
  addTimeOff(
    @Param('providerId') providerId: string,
    @Body() dto: CreateTimeOffDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.availability.addTimeOff(providerId, dto, user);
  }

  @Delete(':providerId/availability/time-off/:id')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'availability.timeOffRemove',
    entity: 'ProviderTimeOff',
    entityIdFrom: 'param:id',
  })
  removeTimeOff(
    @Param('providerId') providerId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.availability.removeTimeOff(providerId, id, user);
  }
}
