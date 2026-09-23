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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE } from '../common/throttle.config.js';
import type { Request, Response, CookieOptions } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlatformAuth } from './decorators/platform-auth.decorator.js';
import {
  CurrentPlatformAdmin,
  type AuthenticatedPlatformAdmin,
} from './decorators/current-platform-admin.decorator.js';
import { parseDurationMs } from '@org/auth';
import {
  PlatformAuthService,
  type PlatformClientMeta,
} from './platform-auth.service.js';
import {
  PlatformLoginDto,
  PlatformLogoutDto,
  PlatformRefreshDto,
} from './dto/platform-login.dto.js';

const PLATFORM_ACCESS_COOKIE = 'cliniq.platform.access';
const PLATFORM_REFRESH_COOKIE = 'cliniq.platform.refresh';

/** Recorded on the session row so a revoked session says where it came from. */
function clientMeta(req: Request): PlatformClientMeta {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: Array.isArray(ua) ? ua[0] : ua };
}

@ApiTags('platform-auth')
@PlatformAuth()
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, clientMeta(req));
    this.setCookies(res, result);
    return result;
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: PlatformRefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const fromCookie = cookies?.[PLATFORM_REFRESH_COOKIE];
    if ((!dto.refreshToken || dto.refreshToken.length === 0) && fromCookie) {
      dto.refreshToken = fromCookie;
    }
    const result = await this.auth.refresh(dto, clientMeta(req));
    this.setCookies(res, result);
    return result;
  }

  // Public so a client whose ACCESS token already expired can still end its
  // session — the refresh token it presents is the authorization.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Platform logout — revokes the refresh session and clears cookies',
  })
  async logout(
    @Body() dto: PlatformLogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto?.refreshToken || req.cookies?.[PLATFORM_REFRESH_COOKIE];
    const result = await this.auth.logoutByToken(token);
    this.clearSessionCookies(res);
    return result;
  }

  /** "Sign out everywhere" — revoke every live session for this admin. */
  @ApiBearerAuth('jwt')
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke every platform refresh session for the current admin',
  })
  async logoutAll(
    @CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logoutAll(admin.adminId);
    this.clearSessionCookies(res);
    return result;
  }

  @ApiBearerAuth('jwt')
  @Get('me')
  me(@CurrentPlatformAdmin() admin: AuthenticatedPlatformAdmin) {
    return admin;
  }

  private setCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite = (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax') as
      | 'lax'
      | 'strict'
      | 'none';
    const domain = this.config.get<string>('COOKIE_DOMAIN');

    const base: CookieOptions = {
      httpOnly: true,
      // Secure by default in production. COOKIE_SECURE=false opts out for a
      // production build served over plain http (e.g. the web-e2e CI job):
      // Chromium/Firefox treat http://localhost as a secure context and still
      // send Secure cookies there, WebKit does not, so every authed page
      // bounced to /login on WebKit only. SameSite=None always requires Secure.
      secure:
        sameSite === 'none' ||
        (this.config.get<string>('COOKIE_SECURE') ?? String(isProd)) === 'true',
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
    };
    // These must be the same keys issueTokensIn signs with, or the cookie
    // outlives the JWT (dead session that looks alive to the proxy) or dies
    // first (signed-out admin holding a still-valid refresh token).
    const accessTtlMs = parseDurationMs(
      this.config.get<string>('PLATFORM_JWT_EXPIRES_IN') ?? '15m',
    );
    const refreshTtlMs = parseDurationMs(
      this.config.get<string>('PLATFORM_REFRESH_TOKEN_EXPIRES_IN') ?? '7d',
    );

    res.cookie(PLATFORM_ACCESS_COOKIE, tokens.accessToken, {
      ...base,
      maxAge: accessTtlMs,
    });
    res.cookie(PLATFORM_REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      maxAge: refreshTtlMs,
      path: this.refreshCookiePath(),
    });
  }

  private clearSessionCookies(res: Response): void {
    const domain = this.config.get<string>('COOKIE_DOMAIN');
    const base: CookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      ...(domain ? { domain } : {}),
    };
    res.clearCookie(PLATFORM_ACCESS_COOKIE, base);
    // Must match the path it was set with, or the browser keeps it and the
    // next refresh replays a token we just revoked.
    res.clearCookie(PLATFORM_REFRESH_COOKIE, {
      ...base,
      path: this.refreshCookiePath(),
    });
  }

  private refreshCookiePath(): string {
    return (
      this.config.get<string>('REFRESH_COOKIE_PATH') ?? '/api/platform/auth'
    );
  }
}
