import { Module } from '@nestjs/common';
import { LabsController } from './labs.controller.js';
import { LabsService } from './labs.service.js';
import { CriticalValueRulesController } from './critical-value-rules.controller.js';
import { CriticalValueRulesService } from './critical-value-rules.service.js';
import { CriticalResultsController } from './critical-results.controller.js';
import { CriticalResultsService } from './critical-results.service.js';
import { CatalogueController } from './catalogue.controller.js';
import { CatalogueService } from './catalogue.service.js';
import { SpecimensController } from './specimens.controller.js';
import { SpecimensService } from './specimens.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { LaboratoryController } from './laboratory.controller.js';
import { LaboratoryService } from './laboratory.service.js';
import { ReferralController } from './referral.controller.js';
import { ReferralService } from './referral.service.js';
import { EqapController } from './eqap.controller.js';
import { EqapService } from './eqap.service.js';

@Module({
  controllers: [
    LabsController,
    CriticalValueRulesController,
    CriticalResultsController,
    CatalogueController,
    SpecimensController,
    ReportsController,
    LaboratoryController,
    ReferralController,
    EqapController,
  ],
  providers: [
    LabsService,
    CriticalValueRulesService,
    CriticalResultsService,
    CatalogueService,
    SpecimensService,
    ReportsService,
    LaboratoryService,
    ReferralService,
    EqapService,
  ],
  exports: [LabsService, ReportsService],
})
export class LabsModule {}
