import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import { AuditService } from './audit.service.js';
import { AUDIT_META_KEY, type AuditMeta } from './audit.decorator.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_META_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

    return next.handle().pipe(
      tap({
        next: (result) => {
          const entityId = resolveEntityId(meta, req, result);
          // Fire-and-forget — audit must never block the response.
          this.audit.record({
            tenantId: req.user?.tenantId ?? null,
            userId: req.user?.userId ?? null,
            onBehalfOfUserId: req.user?.onBehalfOfUserId ?? null,
            actorEmail: req.user?.email ?? null,
            action: meta.action,
            entityType: meta.entity ?? null,
            entityId,
            ip,
            userAgent,
            metadata: { method: req.method, path: req.originalUrl ?? req.url },
          });
        },
        error: (err) => {
          this.audit.record({
            tenantId: req.user?.tenantId ?? null,
            userId: req.user?.userId ?? null,
            onBehalfOfUserId: req.user?.onBehalfOfUserId ?? null,
            actorEmail: req.user?.email ?? null,
            action: `${meta.action}.failed`,
            entityType: meta.entity ?? null,
            entityId: resolveEntityId(meta, req, null),
            ip,
            userAgent,
            metadata: {
              method: req.method,
              path: req.originalUrl ?? req.url,
              error: (err as Error)?.message?.slice(0, 200),
            },
          });
        },
      }),
    );
  }
}

function resolveEntityId(
  meta: AuditMeta,
  req: Request & { params?: Record<string, string>; body?: Record<string, unknown> },
  result: unknown,
): string | null {
  switch (meta.entityIdFrom) {
    case 'param:id':
      return req.params?.id ?? null;
    case 'param:sid':
      return req.params?.sid ?? null;
    case 'body:id':
      return (req.body?.id as string) ?? null;
    case 'result:id':
      return getResultId(result);
    default:
      return req.params?.id ?? getResultId(result);
  }
}

function getResultId(result: unknown): string | null {
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}
