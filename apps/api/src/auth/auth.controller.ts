import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, type ClientMeta } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RegisterPatientDto } from './dto/register-patient.dto.js';
import { RefreshTokenDto } from './dto/refresh.dto.js';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password-reset.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { Public } from './decorators/public.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './decorators/current-user.decorator.js';
import { Audit } from '../audit/audit.decorator.js';
import { AUTH_THROTTLE } from '../common/throttle.config.js';

interface RawRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Pull ip + user-agent off the request for the RefreshSession row. */
function clientMeta(req: RawRequest): ClientMeta {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  };
}

// Every unauthenticated credential endpoint gets the tight `auth` bucket
// (THROTTLE_AUTH_LIMIT per THROTTLE_TTL_MS, per IP). The default bucket
// applied globally in AppModule still covers everything else.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.register', entity: 'User' })
  register(@Body() dto: RegisterDto, @Req() req: RawRequest) {
    return this.auth.register(dto, clientMeta(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.login', entity: 'User' })
  login(@Body() dto: LoginDto, @Req() req: RawRequest) {
    return this.auth.login(dto, clientMeta(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.refresh', entity: 'User' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: RawRequest) {
    return this.auth.refresh(dto, clientMeta(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('patient-register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.patientRegister', entity: 'User' })
  registerPatient(@Body() dto: RegisterPatientDto, @Req() req: RawRequest) {
    return this.auth.registerPatient(dto, clientMeta(req));
  }

  /** Revoke the refresh session in the body. Access token dies at its TTL. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.logout', entity: 'User' })
  logout(@Body() dto: LogoutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auth.logout(user.userId, dto.refreshToken);
  }

  /** "Sign out everywhere" — revoke every refresh session in this tenant. */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.logoutAll', entity: 'User' })
  logoutAll(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.logoutAll(user.userId, user.tenantId);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.forgotPassword', entity: 'User' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.resetPassword', entity: 'User' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
