import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE } from '../common/throttle.config.js';
import { Audit } from '../audit/audit.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { MfaService } from './mfa.service.js';
import { DisableMfaDto, VerifyTotpDto } from './dto/mfa.dto.js';
import { PortalRoute } from '../auth/decorators/portal-route.decorator.js';

@ApiTags('mfa')
@ApiBearerAuth('jwt')
@Controller('mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  // Every route here is self-scoped to the caller (`u.userId`), so portal
  // accounts manage their OWN second factor. @PortalRoute() throughout.
  @Get('status')
  @PortalRoute()
  status(@CurrentUser() u: AuthenticatedUser) {
    return this.mfa.status(u.userId);
  }

  @Post('setup')
  @PortalRoute()
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'mfa.setup', entity: 'User' })
  setup(@CurrentUser() u: AuthenticatedUser) {
    return this.mfa.beginEnrollment(u.userId);
  }

  // 6-digit codes: without a limit, 10^6 guesses is an afternoon.
  @Throttle(AUTH_THROTTLE)
  @Post('verify')
  @PortalRoute()
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'mfa.enable', entity: 'User' })
  verify(@Body() dto: VerifyTotpDto, @CurrentUser() u: AuthenticatedUser) {
    return this.mfa.verifyAndEnable(u.userId, dto.code);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('disable')
  @PortalRoute()
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'mfa.disable', entity: 'User' })
  async disable(
    @Body() dto: DisableMfaDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    await this.mfa.disable(u.userId, dto.code);
    return { ok: true };
  }
}
