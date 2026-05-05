import { Global, Module } from '@nestjs/common';
import { AiBudgetController } from './ai-budget.controller.js';
import { AiBudgetService } from './ai-budget.service.js';

@Global()
@Module({
  controllers: [AiBudgetController],
  providers: [AiBudgetService],
  exports: [AiBudgetService],
})
export class AiBudgetModule {}
