import { Module } from '@nestjs/common';
import { TranscriptsController } from './transcripts.controller.js';
import { FilesModule } from '../files/files.module.js';

@Module({
  imports: [FilesModule],
  controllers: [TranscriptsController],
})
export class TranscriptsModule {}
