import { Module } from '@nestjs/common';
import { VisitTypesController } from './visit-types.controller.js';
import { VisitTypesService } from './visit-types.service.js';

@Module({
  controllers: [VisitTypesController],
  providers: [VisitTypesService],
  exports: [VisitTypesService],
})
export class VisitTypesModule {}
