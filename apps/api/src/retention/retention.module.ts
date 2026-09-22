import { Module } from '@nestjs/common';
import {
  PlatformRetentionController,
  RetentionController,
} from './retention.controller.js';
import { RetentionService } from './retention.service.js';

// ScheduleModule.forRoot() is registered once at AppModule so its global
// providers (Reflector, SchedulerMetadataAccessor) are available app-wide.

@Module({
  controllers: [RetentionController, PlatformRetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
