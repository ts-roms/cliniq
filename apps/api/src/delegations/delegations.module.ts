import { Module } from '@nestjs/common';
import { DelegationsController } from './delegations.controller.js';
import { DelegationsService } from './delegations.service.js';

@Module({
  controllers: [DelegationsController],
  providers: [DelegationsService],
  exports: [DelegationsService],
})
export class DelegationsModule {}
