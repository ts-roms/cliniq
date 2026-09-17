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
import type { Request, Response, CookieOptions } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlatformAuth } from './decorators/platform-auth.decorator.js';
import {
  CurrentPlatformAdmin,
  type AuthenticatedPlatformAdmin,
} from './decorators/current-platform-admin.decorator.js';
import { PlatformAuthService } from './platform-auth.service.js';
import {
  PlatformLoginDto,
  PlatformRefreshDto,
} from './dto/platform-login.dto.js';

const PLATFORM_ACCESS_COOKIE = 'cliniq.platform.access';
const PLATFORM_REFRESH_COOKIE = 'cliniq.platform.refresh';

@ApiTags('platform-auth')
@PlatformAuth()
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: PlatformLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    this.setCookies(res, result);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: PlatformRefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const fromCookie = cookies?.[PLATFORM_REFRESH_COOKIE];
    if ((!dto.refreshToken || dto.refreshToken.length === 0) && fromCookie) {
      dto.refreshToken = fromCookie;
    }
    const result = await this.auth.refresh(dto);
    this.setCookies(res, result);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  // Forces NestJS Swagger to register the operation in openapi.json. Without
  // it, void returns + no @Body fall outside the auto-detection heuristics
  // and the route is silently omitted from the SDK.
  @ApiOperation({ summary: 'Platform logout — clears the platform session cookies' })
  logout(@Res({ passthrough: true }) res: Response): void {
    const opts = this.clearOptions();
    res.clearCookie(PLATFORM_ACCESS_COOKIE, opts);
    res.clearCookie(PLATFORM_REFRESH_COOKIE, opts);
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
      secure: isProd || sameSite === 'none',
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
    };
    const accessTtlMs = parseDurationMs(
      this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
    );
    const refreshTtlMs = parseDurationMs(
      this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '7d',
    );

    res.cookie(PLATFORM_ACCESS_COOKIE, tokens.accessToken, {
      ...base,
      maxAge: accessTtlMs,
    });
    res.cookie(PLATFORM_REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      maxAge: refreshTtlMs,
      path: this.config.get<string>('REFRESH_COOKIE_PATH') ?? '/api/platform/auth',
    });
  }

  private clearOptions(): CookieOptions {
    const domain = this.config.get<string>('COOKIE_DOMAIN');
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      ...(domain ? { domain } : {}),
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
