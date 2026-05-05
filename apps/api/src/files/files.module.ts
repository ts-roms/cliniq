import { Module } from '@nestjs/common';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { FilesJanitorService } from './janitor.service.js';

@Module({
  controllers: [FilesController],
  providers: [FilesService, FilesJanitorService],
  exports: [FilesService],
})
export class FilesModule {}
