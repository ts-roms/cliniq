import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ServiceAuthGuard } from '../common/service-auth.guard.js';
import { BedrockModule } from '../bedrock/bedrock.module.js';
import { DraftsModule } from '../drafts/drafts.module.js';
import { LabDraftsModule } from '../lab-drafts/lab-drafts.module.js';
import { TranscribeModule } from '../transcribe/transcribe.module.js';
import { DermatologyModule } from '../dermatology/dermatology.module.js';
import { HealthModule } from '../health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BedrockModule,
    DraftsModule,
    LabDraftsModule,
    TranscribeModule,
    DermatologyModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global service-to-service auth. Routes opt out with @SkipServiceAuth().
    { provide: APP_GUARD, useClass: ServiceAuthGuard },
  ],
})
export class AppModule {}
