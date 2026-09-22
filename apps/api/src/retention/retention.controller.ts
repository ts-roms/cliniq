import { Controller, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { PlatformAuth } from '../platform/decorators/platform-auth.decorator.js';
import { RetentionService } from './retention.service.js';

@ApiTags('retention')
@ApiBearerAuth('jwt')
@Controller('retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  /**
   * On-demand purge for the caller's own tenant.
   *
   * This used to sweep every tenant on the platform: a single clinic's ADMIN
   * triggered delete work across the whole estate, and the request grew a
   * round-trip per tenant until it timed out (it already exceeded 20s at ~230
   * tenants). The estate-wide sweep now lives on the platform route below,
   * where the scheduler belongs.
   */
  @Post('run-now')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({ action: 'retention.purge', entity: 'System' })
  runNow(@CurrentUser() user: AuthenticatedUser) {
    return this.retention.runForTenant(user.tenantId);
  }
}

@ApiTags('platform-retention')
@ApiBearerAuth('jwt')
@PlatformAuth()
@Controller('platform/retention')
export class PlatformRetentionController {
  constructor(private readonly retention: RetentionService) {}

  /**
   * Estate-wide purge, for the nightly scheduler. Bounded per call — when
   * the response carries a `nextCursor`, call again with it to continue.
   */
  @Post('run-now')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  runNow(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.retention.runForPlatform({
      cursor: cursor || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
