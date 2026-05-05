import { Module } from '@nestjs/common';
import { DrugsController } from './drugs.controller.js';
import { DrugsService } from './drugs.service.js';

@Module({
  controllers: [DrugsController],
  providers: [DrugsService],
  exports: [DrugsService],
})
export class DrugsModule {}
