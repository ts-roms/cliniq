import { Body, Controller, Get, Param, Patch, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Actions } from '@org/auth';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { PortalRoute } from '../auth/decorators/portal-route.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { MeService } from './me.service.js';
import { UpdateStaffProfileDto } from './dto/staff-profile.dto.js';
import { Audit } from '../audit/audit.decorator.js';

/**
 * Patient portal endpoints. All routes are self-scoped: the patient id is
 * derived from JWT (`pid` claim) — never from a path/body param. Staff JWTs
 * (no `pid`) get 403 from MeService.
 *
 * `Requires(PORTAL_READ)` admits portal accounts and only portal accounts —
 * PORTAL_READ is held by the PATIENT role alone. The real scoping happens in
 * MeService.requirePatientId, which reads the JWT `pid` claim.
 *
 * The two `staff-profile` routes are the exception: they are for clinicians,
 * not patients, so they keep PATIENT_READ (every staff role holds it, no
 * portal account does) and MeService.requireStaff does the rest.
 */
@ApiTags('me')
@ApiBearerAuth('jwt')
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('profile')
  @Requires(Actions.PORTAL_READ)
  @PortalRoute()
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.me.profile(user);
  }

  // ── Staff (non-portal): own account + PRC licence ─────────────
  // PATIENT_READ is held by every staff role and by no portal account, so
  // it is the "signed-in staff" gate here; MeService.requireStaff does the
  // real check (and also rejects a delegate acting on someone's behalf).
  // No @PortalRoute() — PortalScopeGuard keeps portal accounts out.

  @Get('staff-profile')
  @Requires(Actions.PATIENT_READ)
  staffProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.me.staffProfile(user);
  }

  @Patch('staff-profile')
  @Requires(Actions.PATIENT_READ)
  @Audit({
    action: 'me.staffProfile.update',
    entity: 'User',
    entityIdFrom: 'result:id',
  })
  updateStaffProfile(
    @Body() dto: UpdateStaffProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.me.updateStaffProfile(dto, user);
  }

  @Get('appointments')
  @Requires(Actions.PORTAL_READ)
  @PortalRoute()
  appointments(@CurrentUser() user: AuthenticatedUser) {
    return this.me.appointments(user);
  }

  @Get('invoices')
  @Requires(Actions.PORTAL_READ)
  @PortalRoute()
  invoices(@CurrentUser() user: AuthenticatedUser) {
    return this.me.invoices(user);
  }

  @Get('records')
  @Requires(Actions.PORTAL_READ)
  @PortalRoute()
  records(@CurrentUser() user: AuthenticatedUser) {
    return this.me.records(user);
  }

  @Get('tele/active')
  @Requires(Actions.PORTAL_READ)
  @PortalRoute()
  teleActive(@CurrentUser() user: AuthenticatedUser) {
    return this.me.teleActive(user);
  }

  @Get('invoices/:id/pdf')
  @Requires(Actions.PORTAL_READ)
  @PortalRoute()
  async invoicePdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.me.invoicePdf(id, user);
    res.set({
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="invoice-${id}.pdf"`,
      'content-length': pdf.length.toString(),
    });
    res.send(pdf);
    return undefined;
  }
}
