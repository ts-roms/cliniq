import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { parseDurationMs } from '@org/auth';
import type { CookieOptions, Response } from 'express';
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

const ACCESS_COOKIE = 'cliniq.access';
const REFRESH_COOKIE = 'cliniq.refresh';

interface RawRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}

/** Pull ip + user-agent off the request for the RefreshSession row. */
function clientMeta(req: RawRequest): ClientMeta {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  };
}

/**
 * Two clients, one guard:
 *   - web uses httpOnly cookies (`cliniq.access` / `cliniq.refresh`) so XSS
 *     can't read the JWTs — set here on every token-issuing route;
 *   - mobile (Expo) keeps `Authorization: Bearer …` from the response body.
 * JwtAuthGuard checks the header first and falls back to the cookie.
 *
 * Every unauthenticated credential endpoint gets the tight `auth` throttle
 * bucket (THROTTLE_AUTH_LIMIT per THROTTLE_TTL_MS, per IP).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.register', entity: 'User' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: RawRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto, clientMeta(req));
    this.setSessionCookies(res, result);
    return result;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.login', entity: 'User' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: RawRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, clientMeta(req));
    this.setSessionCookies(res, result);
    return result;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.refresh', entity: 'User' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: RawRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Web sends an empty body and relies on the httpOnly cookie.
    const fromCookie = req.cookies?.[REFRESH_COOKIE];
    if (!dto.refreshToken && fromCookie) dto.refreshToken = fromCookie;
    const result = await this.auth.refresh(dto, clientMeta(req));
    this.setSessionCookies(res, result);
    return result;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('patient-register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.patientRegister', entity: 'User' })
  async registerPatient(
    @Body() dto: RegisterPatientDto,
    @Req() req: RawRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.registerPatient(dto, clientMeta(req));
    this.setSessionCookies(res, result);
    return result;
  }

  /**
   * Revoke the refresh session (body or cookie) and clear the cookies.
   * Public so a client with an already-expired access token can still sign
   * out cleanly; possession of the refresh token is the authorisation.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout — revokes the refresh session and clears the cookies',
  })
  @Audit({ action: 'auth.logout', entity: 'User' })
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: RawRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto?.refreshToken || req.cookies?.[REFRESH_COOKIE];
    const result = await this.auth.logoutByToken(token);
    this.clearSessionCookies(res);
    return result;
  }

  /** "Sign out everywhere" — revoke every refresh session in this tenant. */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.logoutAll', entity: 'User' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logoutAll(user.userId, user.tenantId);
    this.clearSessionCookies(res);
    return result;
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

  // ── cookies ──────────────────────────────────────────────────────

  private cookieBase(): CookieOptions {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieDomain = this.config.get<string>('COOKIE_DOMAIN');
    const sameSite = (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax') as
      | 'lax'
      | 'strict'
      | 'none';
    return {
      httpOnly: true,
      secure: isProd || sameSite === 'none',
      sameSite,
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
  }

  /** The refresh cookie is scoped to the auth routes so it never rides along on data requests. */
  private refreshCookiePath(): string {
    return this.config.get<string>('REFRESH_COOKIE_PATH') ?? '/api/auth';
  }

  private setSessionCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const base = this.cookieBase();
    const accessTtlMs = parseDurationMs(
      this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
    );
    const refreshTtlMs = parseDurationMs(
      this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '7d',
    );
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...base,
      maxAge: accessTtlMs,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      maxAge: refreshTtlMs,
      path: this.refreshCookiePath(),
    });
  }

  private clearSessionCookies(res: Response): void {
    const base = this.cookieBase();
    res.clearCookie(ACCESS_COOKIE, base);
    // Must match the path it was set with, or the browser keeps it.
    res.clearCookie(REFRESH_COOKIE, {
      ...base,
      path: this.refreshCookiePath(),
    });
  }
}
