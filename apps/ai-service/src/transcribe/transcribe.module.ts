import { Module } from '@nestjs/common';
import { TranscribeController } from './transcribe.controller.js';

@Module({
  controllers: [TranscribeController],
})
export class TranscribeModule {}
