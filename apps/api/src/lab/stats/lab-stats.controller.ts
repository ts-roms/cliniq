import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabStatsService } from './lab-stats.service.js';

/**
 * Read-only stats panel for lab tenants. Gated by LAB_STATS_PANEL
 * (Standard+). Returns aggregates, never raw rows — drill-downs go to
 * `/lab/cases` and `/lab/billing`.
 */
@ApiTags('lab-stats')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_STATS_PANEL)
@Controller('lab/stats')
export class LabStatsController {
  constructor(private readonly stats: LabStatsService) {}

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.stats.overview(user);
  }
}
