import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BedrockModule } from '../bedrock/bedrock.module.js';
import { DraftsModule } from '../drafts/drafts.module.js';
import { TranscribeModule } from '../transcribe/transcribe.module.js';
import { DermatologyModule } from '../dermatology/dermatology.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BedrockModule,
    DraftsModule,
    TranscribeModule,
    DermatologyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
