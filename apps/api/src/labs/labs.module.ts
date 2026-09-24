import { Module } from '@nestjs/common';
import { LabsController } from './labs.controller.js';
import { LabsService } from './labs.service.js';
import { CriticalValueRulesController } from './critical-value-rules.controller.js';
import { CriticalValueRulesService } from './critical-value-rules.service.js';

@Module({
  controllers: [LabsController, CriticalValueRulesController],
  providers: [LabsService, CriticalValueRulesService],
  exports: [LabsService],
})
export class LabsModule {}
