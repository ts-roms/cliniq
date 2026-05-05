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
import { Actions } from '@org/auth';
import { AppointmentStatus } from '@org/db';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { AppointmentsService } from './appointments.service.js';
import {
  AppointmentRangeDto,
  CreateAppointmentDto,
} from './dto/create-appointment.dto.js';

@ApiTags('appointments')
@ApiBearerAuth('jwt')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appts: AppointmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'appointment.create', entity: 'Appointment', entityIdFrom: 'result:id' })
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appts.create(dto, user);
  }

  @Get()
  @Requires(Actions.PATIENT_READ)
  list(@Query() filter: AppointmentRangeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appts.list(filter, user);
  }

  @Patch(':id/check-in')
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'appointment.checkIn', entity: 'Appointment', entityIdFrom: 'param:id' })
  checkIn(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appts.setStatus(id, AppointmentStatus.CHECKED_IN, user);
  }

  @Patch(':id/cancel')
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'appointment.cancel', entity: 'Appointment', entityIdFrom: 'param:id' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appts.cancel(id, user);
  }
}
