import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { ReportsService } from './reports.service.js';

/**
 * Signed laboratory reports.
 *
 * Issuing and signing are both gated on `LAB_RESULT_VERIFY`, the same action
 * that releases a result: putting a PRC licence on a document is the same
 * kind of act as standing behind the values in it. Reading a report is
 * `CONSULT_READ`, because a referring doctor needs to see what was issued
 * without being able to issue anything.
 *
 * Every state-changing route is audited. "Who signed this report, and when"
 * is the first question an inspection asks about a laboratory result.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Issue a report for an order, signed by the caller. */
  @Post('orders/:orderId/reports')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.LAB_RESULT_VERIFY)
  @Audit({
    action: 'lis.reportIssue',
    entity: 'LabReport',
    entityIdFrom: 'result:id',
  })
  issue(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.issue(orderId, user);
  }

  /** Every report ever issued for an order, newest version first. */
  @Get('orders/:orderId/reports')
  @Requires(Actions.CONSULT_READ)
  list(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.list(orderId, user);
  }

  /**
   * One report. `isCurrent` is computed against the results as they stand
   * now, so a report that a later correction invalidated says so.
   */
  @Get('reports/:id')
  @Requires(Actions.CONSULT_READ)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.detail(id, user);
  }

  /** Countersign an issued report — a pathologist endorsing it. */
  @Post('reports/:id/sign')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.LAB_RESULT_VERIFY)
  @Audit({
    action: 'lis.reportSign',
    entity: 'LabReport',
    entityIdFrom: 'param:id',
  })
  sign(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.sign(id, user);
  }
}
