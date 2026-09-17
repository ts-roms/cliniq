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
import type { Request, Response, CookieOptions } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { RegisterPatientDto } from './dto/register-patient.dto.js';
import { RefreshTokenDto } from './dto/refresh.dto.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator.js';
import { Audit } from '../audit/audit.decorator.js';

const ACCESS_COOKIE = 'cliniq.access';
const REFRESH_COOKIE = 'cliniq.refresh';

/**
 * The web client uses httpOnly cookies so XSS can't read the JWT. The mobile
 * client (Expo) keeps using `Authorization: Bearer …` from the response body
 * — both flow through the same JwtAuthGuard, which checks the header first
 * and falls back to the cookie.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.register', entity: 'User' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto);
    this.setSessionCookies(res, result);
    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.login', entity: 'User' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    this.setSessionCookies(res, result);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'auth.refresh', entity: 'User' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshFromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
    if ((!dto.refreshToken || dto.refreshToken.length === 0) && refreshFromCookie) {
      dto.refreshToken = refreshFromCookie;
    }
    const result = await this.auth.refresh(dto);
    this.setSessionCookies(res, result);
    return result;
  }

  @Public()
  @Post('patient-register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.patientRegister', entity: 'User' })
  async registerPatient(
    @Body() dto: RegisterPatientDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.registerPatient(dto);
    this.setSessionCookies(res, result);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  // Forces NestJS Swagger to register the operation in openapi.json. Without
  // it, void returns + no @Body fall outside the auto-detection heuristics
  // and the route is silently omitted from the SDK.
  @ApiOperation({ summary: 'Logout — clears the access + refresh cookies' })
  @Audit({ action: 'auth.logout', entity: 'User' })
  logout(@Res({ passthrough: true }) res: Response): void {
    const opts = this.cookieClearOptions();
    res.clearCookie(ACCESS_COOKIE, opts);
    res.clearCookie(REFRESH_COOKIE, opts);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private setSessionCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieDomain = this.config.get<string>('COOKIE_DOMAIN');
    const sameSite = (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax') as
      | 'lax'
      | 'strict'
      | 'none';

    const accessTtlMs = parseDurationMs(
      this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
    );
    const refreshTtlMs = parseDurationMs(
      this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '7d',
    );

    const base: CookieOptions = {
      httpOnly: true,
      secure: isProd || sameSite === 'none',
      sameSite,
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };

    res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: accessTtlMs });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      maxAge: refreshTtlMs,
      path: this.config.get<string>('REFRESH_COOKIE_PATH') ?? '/api/auth',
    });
  }

  private cookieClearOptions(): CookieOptions {
    const cookieDomain = this.config.get<string>('COOKIE_DOMAIN');
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
  }
}

function parseDurationMs(input: string): number {
  const m = /^(\d+)(ms|s|m|h|d)?$/i.exec(input.trim());
  if (!m) return 15 * 60 * 1000;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'ms').toLowerCase();
  switch (unit) {
    case 'ms': return n;
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}
