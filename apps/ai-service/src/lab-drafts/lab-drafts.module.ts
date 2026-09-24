import { Module } from '@nestjs/common';
import { LabDraftsController } from './dental-lab-drafts.controller.js';
import { LabDraftsService } from './dental-lab-drafts.service.js';

@Module({
  controllers: [LabDraftsController],
  providers: [LabDraftsService],
  exports: [LabDraftsService],
})
export class LabDraftsModule {}
