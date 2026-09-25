import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import { EqapService } from './eqap.service.js';
import {
  RecordEqapResultDto,
  SubmitEqapRoundDto,
  UpsertEqapEnrolmentDto,
  UpsertEqapProviderDto,
} from './dto/eqap.dto.js';

/**
 * External quality assessment.
 *
 * Providers and enrolments are `CLINIC_ADMIN` — participation is a
 * commercial and regulatory commitment. Submitting a round and recording the
 * result are `LAB_RESULT_ENTER`, because that is bench work.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis/eqap')
export class EqapController {
  constructor(private readonly eqap: EqapService) {}

  @Get('providers')
  @Requires(Actions.CONSULT_READ)
  listProviders(@CurrentUser() user: AuthenticatedUser) {
    return this.eqap.listProviders(user);
  }

  @Put('providers')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.eqapProviderUpsert',
    entity: 'EqapProvider',
    entityIdFrom: 'result:id',
  })
  upsertProvider(
    @Body() dto: UpsertEqapProviderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eqap.upsertProvider(dto, user);
  }

  /** Enrolments, each with its participation record. */
  @Get('enrolments')
  @Requires(Actions.CONSULT_READ)
  listEnrolments(@CurrentUser() user: AuthenticatedUser) {
    return this.eqap.listEnrolments(user);
  }

  @Put('enrolments')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.eqapEnrolmentUpsert',
    entity: 'EqapEnrolment',
    entityIdFrom: 'result:id',
  })
  upsertEnrolment(
    @Body() dto: UpsertEqapEnrolmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eqap.upsertEnrolment(dto, user);
  }

  @Get('enrolments/:id/submissions')
  @Requires(Actions.CONSULT_READ)
  listSubmissions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eqap.listSubmissions(id, user);
  }

  /** Record what we sent for a round. */
  @Post('submissions')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.LAB_RESULT_ENTER)
  @Audit({
    action: 'lis.eqapSubmit',
    entity: 'EqapSubmission',
    entityIdFrom: 'result:id',
  })
  submitRound(
    @Body() dto: SubmitEqapRoundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eqap.submitRound(dto, user);
  }

  /** Record what the provider sent back, and any corrective action. */
  @Post('submissions/:id/result')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.LAB_RESULT_ENTER)
  @Audit({
    action: 'lis.eqapResultRecord',
    entity: 'EqapSubmission',
    entityIdFrom: 'param:id',
  })
  recordResult(
    @Param('id') id: string,
    @Body() dto: RecordEqapResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.eqap.recordResult(id, dto, user);
  }
}
