import { Module } from '@nestjs/common';
import { ObController } from './ob.controller.js';
import { ObService } from './ob.service.js';

@Module({
  controllers: [ObController],
  providers: [ObService],
  exports: [ObService],
})
export class ObModule {}
