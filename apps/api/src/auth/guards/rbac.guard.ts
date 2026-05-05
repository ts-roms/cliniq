import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Action } from '@org/auth';
import { REQUIRES_KEY } from '../decorators/requires.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Action[] | undefined>(REQUIRES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new ForbiddenException('not authenticated');

    const allowed = required.every((a) => can(req.user!.role, a));
    if (!allowed) throw new ForbiddenException(`role ${req.user.role} lacks: ${required.join(', ')}`);
    return true;
  }
}
