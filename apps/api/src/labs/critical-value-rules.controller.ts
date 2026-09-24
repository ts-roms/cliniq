import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { CriticalValueRulesService } from './critical-value-rules.service.js';
import {
  CreateCriticalValueRuleDto,
  UpdateCriticalValueRuleDto,
} from './dto/critical-value-rules.dto.js';

/**
 * The laboratory's configured critical limits — the only source of
 * CRITICAL_HIGH / CRITICAL_LOW on a result.
 *
 * Reads are open to anyone who can read a consult, so a clinician looking at
 * a flagged result can see the limit that produced it. Writes are CLINIC_ADMIN
 * (OWNER + ADMIN): setting the threshold at which a patient gets telephoned is
 * a governance decision, not a day-to-day one. When the LIS lands and the role
 * vocabulary grows a PATHOLOGIST / LAB_HEAD, these move there.
 *
 * Every write is audited.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis/critical-value-rules')
export class CriticalValueRulesController {
  constructor(private readonly rules: CriticalValueRulesService) {}

  @Get()
  @Requires(Actions.CONSULT_READ)
  @ApiQuery({ name: 'includeExpired', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeExpired') includeExpired?: string,
  ) {
    return this.rules.list(user, {
      includeExpired: includeExpired === 'true',
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lab.criticalValueRuleCreate',
    entity: 'CriticalValueRule',
    entityIdFrom: 'result:id',
  })
  create(
    @Body() dto: CreateCriticalValueRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rules.create(dto, user);
  }

  @Patch(':id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lab.criticalValueRuleUpdate',
    entity: 'CriticalValueRule',
    entityIdFrom: 'param:id',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCriticalValueRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rules.update(id, dto, user);
  }

  @Delete(':id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lab.criticalValueRuleRetire',
    entity: 'CriticalValueRule',
    entityIdFrom: 'param:id',
  })
  retire(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.retire(id, user);
  }
}
