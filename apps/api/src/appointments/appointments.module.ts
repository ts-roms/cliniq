import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { ConsultationsModule } from '../consultations/consultations.module.js';
import { AvailabilityModule } from '../availability/availability.module.js';

@Module({
  // ConsultationsModule for PATCH /appointments/:id/start, which opens the
  // consult in the same transaction as the IN_PROGRESS transition.
  imports: [ConsultationsModule, AvailabilityModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
