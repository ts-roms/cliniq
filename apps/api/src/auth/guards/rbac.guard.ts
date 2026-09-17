import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Action } from '@org/auth';
import { REQUIRES_KEY } from '../decorators/requires.decorator.js';
import { IS_PLATFORM_KEY } from '../../platform/decorators/platform-auth.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // Platform routes have no tenant role — RBAC doesn't apply.
    const isPlatform = this.reflector.getAllAndOverride<boolean>(IS_PLATFORM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPlatform) return true;

    const required = this.reflector.getAllAndOverride<Action[] | undefined>(REQUIRES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new ForbiddenException('not authenticated');

    // Step 1: the user's effective role must hold every required action. If
    // the request is acting-on-behalf-of, JwtAuthGuard already swapped the
    // role to the delegator's, so this still works.
    const allowed = required.every((a) => can(req.user!.role, a));
    if (!allowed) {
      throw new ForbiddenException(`role ${req.user.role} lacks: ${required.join(', ')}`);
    }

    // Step 2: if the request rides on a delegation with a non-empty scope,
    // narrow further. An empty `delegationScope` (or no delegation at all)
    // means "full proxy / not delegated" and skips this check.
    const scope = req.user.delegationScope;
    if (req.user.onBehalfOfUserId && scope && scope.length > 0) {
      const scoped = required.every((a) => scope.includes(a));
      if (!scoped) {
        throw new ForbiddenException(
          `delegation scope lacks: ${required.filter((a) => !scope.includes(a)).join(', ')}`,
        );
      }
    }
    return true;
  }
}
