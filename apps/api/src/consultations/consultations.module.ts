import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller.js';
import { ConsultationsService } from './consultations.service.js';
import { FilesModule } from '../files/files.module.js';
import { IcdCodesModule } from '../icd-codes/icd-codes.module.js';

@Module({
  imports: [FilesModule, IcdCodesModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
