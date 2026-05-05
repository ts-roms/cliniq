import { Module } from '@nestjs/common';
import { DermatologyController } from './dermatology.controller.js';

@Module({
  controllers: [DermatologyController],
})
export class DermatologyModule {}
