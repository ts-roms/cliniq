import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Actions } from '@org/auth';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { MeService } from './me.service.js';

/**
 * Patient portal endpoints. All routes are self-scoped: the patient id is
 * derived from JWT (`pid` claim) — never from a path/body param. Staff JWTs
 * (no `pid`) get 403 from MeService.
 *
 * `Requires(PATIENT_READ)` is a coarse gate (PATIENT role has it); the real
 * scoping happens in MeService.requirePatientId.
 */
@ApiTags('me')
@ApiBearerAuth('jwt')
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('profile')
  @Requires(Actions.PATIENT_READ)
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.me.profile(user);
  }

  @Get('appointments')
  @Requires(Actions.PATIENT_READ)
  appointments(@CurrentUser() user: AuthenticatedUser) {
    return this.me.appointments(user);
  }

  @Get('invoices')
  @Requires(Actions.PATIENT_READ)
  invoices(@CurrentUser() user: AuthenticatedUser) {
    return this.me.invoices(user);
  }

  @Get('records')
  @Requires(Actions.PATIENT_READ)
  records(@CurrentUser() user: AuthenticatedUser) {
    return this.me.records(user);
  }

  @Get('tele/active')
  @Requires(Actions.PATIENT_READ)
  teleActive(@CurrentUser() user: AuthenticatedUser) {
    return this.me.teleActive(user);
  }

  @Get('invoices/:id/pdf')
  @Requires(Actions.PATIENT_READ)
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
