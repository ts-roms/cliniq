import { Module } from '@nestjs/common';
import { TranscribeController } from './transcribe.controller.js';
import { TranscribeService } from './transcribe.service.js';

@Module({
  controllers: [TranscribeController],
  providers: [TranscribeService],
})
export class TranscribeModule {}
