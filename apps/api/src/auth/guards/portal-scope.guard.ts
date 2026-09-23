import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '@org/auth';
import { IS_PORTAL_ROUTE_KEY } from '../decorators/portal-route.decorator.js';
import { IS_PLATFORM_KEY } from '../../platform/decorators/platform-auth.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

/**
 * Closes the staff surface to portal accounts.
 *
 * A PATIENT-role JWT may only reach handlers marked `@PortalRoute()`. This is
 * deliberately redundant with the action matrix (PATIENT holds PORTAL_READ and
 * nothing else): the bug this guards against is someone gating a staff route on
 * an action the PATIENT role happens to hold, which is exactly how
 * GET /api/patients came to be readable by portal accounts.
 *
 * Runs after JwtAuthGuard (needs `req.user`) and before RbacGuard, so a portal
 * account probing a staff route gets "not available to portal accounts" rather
 * than a role/action message that leaks the action vocabulary.
 */
@Injectable()
export class PortalScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPlatform = this.reflector.getAllAndOverride<boolean>(
      IS_PLATFORM_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (isPlatform) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    // @Public routes short-circuit JwtAuthGuard and never set req.user.
    if (!req.user) return true;
    if (req.user.role !== Roles.PATIENT) return true;

    const isPortalRoute = this.reflector.getAllAndOverride<boolean>(
      IS_PORTAL_ROUTE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!isPortalRoute) {
      throw new ForbiddenException(
        'not available to portal accounts — use /api/me/*',
      );
    }
    return true;
  }
}
