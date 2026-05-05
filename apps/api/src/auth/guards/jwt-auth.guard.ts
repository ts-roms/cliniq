import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { MemberStatus, PrismaService } from '@org/db';
import { verifyJwt } from '@org/auth';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';
import { DelegationsService } from '../../delegations/delegations.service.js';

const ACTING_FOR_HEADER = 'x-acting-for';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly delegations: DelegationsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
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
      payload = await verifyJwt(token, { secret });
    } catch (err) {
      this.logger.warn(`JWT verify failed: ${(err as Error).message}`);
      throw new UnauthorizedException('invalid token');
    }

    const user: AuthenticatedUser = {
      userId: payload.sub,
      tenantId: payload.tid,
      role: payload.role,
      email: payload.email,
      patientId: payload.pid,
    };

    // X-Acting-For: <userId>. If present, validate an active delegation exists
    // and override the request's effective role with the delegator's role.
    const actingForRaw = req.headers[ACTING_FOR_HEADER];
    const actingFor = Array.isArray(actingForRaw) ? actingForRaw[0] : actingForRaw;
    if (actingFor && actingFor.trim().length > 0) {
      if (actingFor === user.userId) {
        throw new ForbiddenException('cannot act on behalf of yourself');
      }
      const delegation = await this.delegations.findActiveDelegation(
        user.tenantId,
        actingFor,
        user.userId,
      );
      if (!delegation) {
        throw new ForbiddenException('no active delegation for that user');
      }
      // Look up the delegator's current tenant role — it may differ from the
      // role at grant time, and we always honor what's current.
      const membership = await this.prisma.tenantUser.findFirst({
        where: {
          tenantId: user.tenantId,
          userId: actingFor,
          status: MemberStatus.ACTIVE,
        },
        select: { role: true },
      });
      if (!membership) {
        throw new ForbiddenException('delegator is no longer an active member');
      }
      user.role = membership.role as AuthenticatedUser['role'];
      user.onBehalfOfUserId = actingFor;
      user.delegationScope = delegation.scope ?? [];
    }

    req.user = user;
    return true;
  }
}
