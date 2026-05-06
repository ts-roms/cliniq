import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@org/db';
import { verifyPlatformJwt } from '@org/auth';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { IS_PLATFORM_KEY } from '../decorators/platform-auth.decorator.js';
import type { AuthenticatedPlatformAdmin } from '../decorators/current-platform-admin.decorator.js';

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  private readonly logger = new Logger(PlatformAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Only run on @PlatformAuth-marked routes; everything else is the
    // tenant JwtAuthGuard's concern.
    const isPlatform = this.reflector.getAllAndOverride<boolean>(IS_PLATFORM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!isPlatform) return true;

    // Login/refresh are platform routes but @Public — no token to verify.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      platformAdmin?: AuthenticatedPlatformAdmin;
    }>();
    const header = req.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    const token = raw.slice(7);
    const secret = this.config.getOrThrow<string>('JWT_SECRET');

    let payload;
    try {
      payload = await verifyPlatformJwt(token, { secret });
    } catch (err) {
      this.logger.warn(`platform JWT verify failed: ${(err as Error).message}`);
      throw new UnauthorizedException('invalid token');
    }

    // Re-confirm the admin still exists and isn't deleted. Cheap read; cached
    // tokens shouldn't outlive a deleted admin.
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, deletedAt: true },
    });
    if (!admin || admin.deletedAt) {
      throw new UnauthorizedException('platform admin not found');
    }

    req.platformAdmin = { adminId: admin.id, email: admin.email };
    return true;
  }
}
