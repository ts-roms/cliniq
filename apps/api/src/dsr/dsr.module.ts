import { Module } from '@nestjs/common';
import { DsrController } from './dsr.controller.js';
import { DsrService } from './dsr.service.js';

@Module({
  controllers: [DsrController],
  providers: [DsrService],
  exports: [DsrService],
})
export class DsrModule {}
