import { Module } from '@nestjs/common';
import { TeleController } from './tele.controller.js';
import { TeleService } from './tele.service.js';

@Module({
  controllers: [TeleController],
  providers: [TeleService],
  exports: [TeleService],
})
export class TeleModule {}
