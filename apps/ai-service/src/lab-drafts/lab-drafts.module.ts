import { Module } from '@nestjs/common';
import { LabDraftsController } from './lab-drafts.controller.js';
import { LabDraftsService } from './lab-drafts.service.js';

@Module({
  controllers: [LabDraftsController],
  providers: [LabDraftsService],
  exports: [LabDraftsService],
})
export class LabDraftsModule {}
