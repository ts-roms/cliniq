import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';
import { BillingModule } from '../billing/billing.module.js';
import { FilesModule } from '../files/files.module.js';

@Module({
  imports: [BillingModule, FilesModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
