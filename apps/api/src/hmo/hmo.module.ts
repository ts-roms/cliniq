import { Module } from '@nestjs/common';
import { HmoController } from './hmo.controller.js';
import { HmoService } from './hmo.service.js';

@Module({
  controllers: [HmoController],
  providers: [HmoService],
  exports: [HmoService],
})
export class HmoModule {}
