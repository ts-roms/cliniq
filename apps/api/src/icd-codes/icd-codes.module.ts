import { Module } from '@nestjs/common';
import { IcdCodesController } from './icd-codes.controller.js';
import { IcdCodesService } from './icd-codes.service.js';

@Module({
  controllers: [IcdCodesController],
  providers: [IcdCodesService],
  exports: [IcdCodesService],
})
export class IcdCodesModule {}
