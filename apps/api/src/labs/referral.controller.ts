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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { ReferralStatus } from '@org/db';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { ReferralService } from './referral.service.js';
import {
  MarkReferralDto,
  UpsertReferralLaboratoryDto,
} from './dto/referral.dto.js';

/**
 * Referral laboratories and the send-out worklist.
 *
 * Managing destinations is `CLINIC_ADMIN` — it is a standing commercial and
 * regulatory arrangement, not clinical work. Marking a specimen sent or
 * received is `CONSULT_WRITE`, because that is the bench recording what
 * physically happened.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis/referrals')
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

  @Get('laboratories')
  @Requires(Actions.CONSULT_READ)
  listLaboratories(@CurrentUser() user: AuthenticatedUser) {
    return this.referrals.list(user);
  }

  @Put('laboratories')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.referralLabUpsert',
    entity: 'ReferralLaboratory',
    entityIdFrom: 'result:id',
  })
  upsertLaboratory(
    @Body() dto: UpsertReferralLaboratoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.referrals.upsertLaboratory(dto, user);
  }

  @Delete('laboratories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.referralLabRemove',
    entity: 'ReferralLaboratory',
    entityIdFrom: 'param:id',
  })
  removeLaboratory(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.referrals.removeLaboratory(id, user);
  }

  /** The send-out worklist. */
  @Get()
  @Requires(Actions.CONSULT_READ)
  // `enum: Object.values(...)` via enumName — see specimens.controller.ts for
  // why a bare Prisma enum object breaks Swagger's query-param factory.
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ReferralStatus,
    enumName: 'ReferralStatus',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ReferralStatus,
  ) {
    return this.referrals.listReferrals(user, { status });
  }

  /** The specimen has gone. */
  @Patch(':id/sent')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lis.referralSent',
    entity: 'LabReferral',
    entityIdFrom: 'param:id',
  })
  markSent(
    @Param('id') id: string,
    @Body() dto: MarkReferralDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.referrals.mark(id, ReferralStatus.SENT, dto, user);
  }

  /** The result has come back. */
  @Patch(':id/received')
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lis.referralReceived',
    entity: 'LabReferral',
    entityIdFrom: 'param:id',
  })
  markReceived(
    @Param('id') id: string,
    @Body() dto: MarkReferralDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.referrals.mark(id, ReferralStatus.RECEIVED, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.CONSULT_WRITE)
  @Audit({
    action: 'lis.referralCancel',
    entity: 'LabReferral',
    entityIdFrom: 'param:id',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: MarkReferralDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.referrals.mark(id, ReferralStatus.CANCELLED, dto, user);
  }
}
