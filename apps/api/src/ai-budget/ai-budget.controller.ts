import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { AiBudgetService } from './ai-budget.service.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';

@ApiTags('ai-budget')
@ApiBearerAuth('jwt')
@Controller('ai-budget')
export class AiBudgetController {
  constructor(private readonly budget: AiBudgetService) {}

  @Get()
  @Requires(Actions.AI_USE)
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.budget.getUsage(user.tenantId);
  }
}
