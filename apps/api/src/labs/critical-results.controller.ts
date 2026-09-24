import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CriticalResultsService } from './critical-results.service.js';
import { AcknowledgeCriticalResultDto } from './dto/critical-results.dto.js';

/**
 * The critical-result call-back queue.
 *
 * CONSULT_READ to see it and CONSULT_WRITE to acknowledge: acknowledging is a
 * clinical act (you are asserting you were told and have acted), so it sits
 * with the clinicians rather than with front desk. Every acknowledgement is
 * audited — the audit row is what evidences the call-back, alongside the
 * read-back stored on the notification itself.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis/critical-results')
export class CriticalResultsController {
  constructor(private readonly criticals: CriticalResultsService) {}

  @Get()
  @Requires(Actions.CONSULT_READ)
  @ApiQuery({ name: 'includeAcknowledged', required: false, type: Boolean })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeAcknowledged') includeAcknowledged?: string,
  ) {
    return this.criticals.list(user, {
      includeAcknowledged: includeAcknowledged === 'true',
    });
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lab.criticalResultAcknowledge',
    entity: 'CriticalResultNotification',
    entityIdFrom: 'param:id',
  })
  acknowledge(
    @Param('id') id: string,
    @Body() dto: AcknowledgeCriticalResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.criticals.acknowledge(id, dto, user);
  }
}
