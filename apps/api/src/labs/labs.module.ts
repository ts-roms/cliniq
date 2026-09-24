import { Module } from '@nestjs/common';
import { LabsController } from './labs.controller.js';
import { LabsService } from './labs.service.js';
import { CriticalValueRulesController } from './critical-value-rules.controller.js';
import { CriticalValueRulesService } from './critical-value-rules.service.js';
import { CriticalResultsController } from './critical-results.controller.js';
import { CriticalResultsService } from './critical-results.service.js';
import { CatalogueController } from './catalogue.controller.js';
import { CatalogueService } from './catalogue.service.js';

@Module({
  controllers: [
    LabsController,
    CriticalValueRulesController,
    CriticalResultsController,
    CatalogueController,
  ],
  providers: [
    LabsService,
    CriticalValueRulesService,
    CriticalResultsService,
    CatalogueService,
  ],
  exports: [LabsService],
})
export class LabsModule {}
