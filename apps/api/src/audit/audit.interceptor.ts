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
import { readReason } from './changes.js';
import { TenantContext } from '../common/tenant-context.middleware.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(
      AUDIT_META_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!meta) return next.handle();

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip ??
      null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

    return next.handle().pipe(
      tap({
        next: (result) => {
          const entityId = resolveEntityId(meta, req, result);
          // Whatever the services changed during this request. Drained, so a
          // second audited handler in the same request cannot report the
          // first one's changes a second time.
          const { changes, reason } = TenantContext.drainChanges();
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
            changes,
            // A reason recorded by the service wins over one read off the
            // body: the service knows which field it actually used.
            reason: reason ?? readReason(req.body),
          });
        },
        error: (err) => {
          // Discarded, not recorded. A request that threw changed nothing —
          // the transaction rolled back — so attaching the diff a service
          // computed before the failure would assert a change that never
          // happened. Draining rather than ignoring also stops it leaking
          // into the next audited action on this request.
          TenantContext.drainChanges();
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
  // Structural on purpose: express's Request params type (ParamsDictionary)
  // is not assignable to a plain Record, and only these two fields are read.
  req: {
    params?: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  result: unknown,
): string | null {
  // Any `param:<name>` reads that route param. This used to know only
  // `param:id` / `param:sid`; the 14 controllers passing `param:caseId`,
  // `param:fileId`, … silently fell through to the default and logged the
  // wrong entity id.
  if (meta.entityIdFrom?.startsWith('param:')) {
    const v = req.params?.[meta.entityIdFrom.slice('param:'.length)];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  }
  switch (meta.entityIdFrom) {
    case 'body:id':
      return ((req.body as { id?: unknown } | undefined)?.id as string) ?? null;
    case 'result:id':
      return getResultId(result);
    default:
      return (
        (Array.isArray(req.params?.id) ? req.params.id[0] : req.params?.id) ??
        getResultId(result)
      );
  }
}

function getResultId(result: unknown): string | null {
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}
