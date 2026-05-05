import { Module } from '@nestjs/common';
import { CalendarsController } from './calendars.controller.js';
import { CalendarsService } from './calendars.service.js';

@Module({
  controllers: [CalendarsController],
  providers: [CalendarsService],
  exports: [CalendarsService],
})
export class CalendarsModule {}
