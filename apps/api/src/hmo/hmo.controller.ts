import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { HmoClaimStatus } from '@org/db';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { HmoService } from './hmo.service.js';
import {
  CreateHmoMembershipDto,
  CreateHmoProviderDto,
  FileClaimDto,
  RecordHmoPaymentDto,
  UpdateClaimDto,
  UpdateProviderDto,
} from './dto/hmo.dto.js';

@ApiTags('hmo')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.HMO)
@Controller()
export class HmoController {
  constructor(private readonly hmo: HmoService) {}

  // ── Provider catalog ─────────────────────────────
  @Get('hmo/providers')
  @Requires(Actions.BILLING_READ)
  listProviders(@CurrentUser() user: AuthenticatedUser) {
    return this.hmo.listProviders(user);
  }

  @Post('hmo/providers')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.BILLING_WRITE)
  @Audit({ action: 'hmo.providerCreate', entity: 'HmoProvider', entityIdFrom: 'result:id' })
  createProvider(@Body() dto: CreateHmoProviderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.hmo.createProvider(dto, user);
  }

  @Patch('hmo/providers/:id')
  @Requires(Actions.BILLING_WRITE)
  @Audit({ action: 'hmo.providerUpdate', entity: 'HmoProvider', entityIdFrom: 'param:id' })
  updateProvider(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hmo.updateProvider(id, dto, user);
  }

  // ── Patient memberships ──────────────────────────
  @Get('patients/:patientId/hmo-memberships')
  @Requires(Actions.PATIENT_READ)
  listMemberships(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hmo.listMemberships(patientId, user);
  }

  @Post('patients/:patientId/hmo-memberships')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @Audit({ action: 'hmo.membershipAdd', entity: 'HmoMembership', entityIdFrom: 'result:id' })
  addMembership(
    @Param('patientId') patientId: string,
    @Body() dto: CreateHmoMembershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hmo.addMembership(patientId, dto, user);
  }

  // ── Claims ───────────────────────────────────────
  @Get('hmo/claims')
  @Requires(Actions.BILLING_READ)
  listClaims(
    @Query('status') status: HmoClaimStatus | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hmo.listClaims(user, status);
  }

  @Post('invoices/:id/hmo-claims')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.BILLING_WRITE)
  @Audit({ action: 'hmo.claimFile', entity: 'HmoClaim', entityIdFrom: 'result:id' })
  fileClaim(
    @Param('id') invoiceId: string,
    @Body() dto: FileClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hmo.fileClaim(invoiceId, dto, user);
  }

  @Patch('hmo/claims/:id')
  @Requires(Actions.BILLING_WRITE)
  @Audit({ action: 'hmo.claimUpdate', entity: 'HmoClaim', entityIdFrom: 'param:id' })
  updateClaim(
    @Param('id') id: string,
    @Body() dto: UpdateClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hmo.updateClaim(id, dto, user);
  }

  @Post('hmo/claims/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.BILLING_WRITE)
  @Audit({ action: 'hmo.claimPaid', entity: 'HmoClaim', entityIdFrom: 'param:id' })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordHmoPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hmo.recordHmoPayment(id, dto, user);
  }
}
