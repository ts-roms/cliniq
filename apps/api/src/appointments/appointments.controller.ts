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
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { ConsultationsService } from '../consultations/consultations.service.js';
import { AppointmentsService } from './appointments.service.js';
import {
  AppointmentRangeDto,
  CreateAppointmentDto,
} from './dto/create-appointment.dto.js';
import {
  CancelAppointmentDto,
  NoShowSweepDto,
  RescheduleAppointmentDto,
} from './dto/transition.dto.js';

/**
 * Appointment lifecycle. Front-desk moves (book / check-in / reschedule /
 * cancel / no-show) need PATIENT_WRITE; opening or closing the clinical
 * encounter (start / complete) needs CONSULT_WRITE. Illegal moves are 409.
 * See appointment-transitions.ts for the machine.
 */
@ApiTags('appointments')
@ApiBearerAuth('jwt')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appts: AppointmentsService,
    private readonly consults: ConsultationsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({
    action: 'appointment.create',
    entity: 'Appointment',
    entityIdFrom: 'result:id',
  })
  create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appts.create(dto, user);
  }

  @Get()
  @Requires(Actions.PATIENT_READ)
  list(
    @Query() filter: AppointmentRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appts.list(filter, user);
  }

  /**
   * Admin: mark every SCHEDULED appointment whose slot ended more than
   * `graceMinutes` ago as NO_SHOW, for this tenant only. The background
   * sweep does the same across tenants when APPT_AUTO_NOSHOW_ENABLED=true.
   */
  @Post('no-show-sweep')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'appointment.noShowSweep', entity: 'Appointment' })
  async noShowSweep(
    @Body() dto: NoShowSweepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const marked = await this.appts.markOverdueNoShows(
      dto.graceMinutes,
      user.tenantId,
    );
    return { marked };
  }

  @Get(':id')
  @Requires(Actions.PATIENT_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appts.findOne(id, user);
  }

  @Patch(':id/check-in')
  @Requires(Actions.PATIENT_WRITE)
  @Audit({
    action: 'appointment.checkIn',
    entity: 'Appointment',
    entityIdFrom: 'param:id',
  })
  checkIn(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appts.checkIn(id, user);
  }

  /**
   * Open the consult for this slot. Returns the appointment (now
   * IN_PROGRESS) with `consultation.id` so the client can navigate to it.
   */
  @Patch(':id/start')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'appointment.start',
    entity: 'Appointment',
    entityIdFrom: 'param:id',
  })
  async start(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.consults.start({ appointmentId: id }, user);
    return this.appts.findOne(id, user);
  }

  /** For slots without a consult (procedures, follow-ups handled outside SOAP). */
  @Patch(':id/complete')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'appointment.complete',
    entity: 'Appointment',
    entityIdFrom: 'param:id',
  })
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appts.complete(id, user);
  }

  @Patch(':id/no-show')
  @Requires(Actions.PATIENT_WRITE)
  @Audit({
    action: 'appointment.noShow',
    entity: 'Appointment',
    entityIdFrom: 'param:id',
  })
  noShow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appts.noShow(id, user);
  }

  @Patch(':id/reschedule')
  @Requires(Actions.PATIENT_WRITE)
  @Audit({
    action: 'appointment.reschedule',
    entity: 'Appointment',
    entityIdFrom: 'param:id',
  })
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appts.reschedule(id, dto, user);
  }

  @Patch(':id/cancel')
  @Requires(Actions.PATIENT_WRITE)
  @Audit({
    action: 'appointment.cancel',
    entity: 'Appointment',
    entityIdFrom: 'param:id',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appts.cancel(id, user, dto ?? {});
  }
}
