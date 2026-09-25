import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyJwt } from '@org/auth';
import { PrismaService } from '@org/db';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Resolves the active tenant for every request and exposes it to downstream
 * Prisma operations via the AsyncLocalStorage in TenantContext.
 *
 * Resolution order:
 *   1. Subdomain — `<slug>.cliniq.app` → tenant.slug = "<slug>"
 *   2. JWT `tid` claim (header or cookie)
 *   3. None (public routes only — request proceeds with no tenant context)
 *
 * If the resolved tenant doesn't exist, the request still proceeds; downstream
 * RLS will return zero rows. This is intentional — never leak tenant existence
 * via 404 here, and let the controller's authn/z guards do the real rejection.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly rootDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.rootDomain =
      this.config.get<string>('APP_ROOT_DOMAIN') ?? 'cliniq.app';
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = await this.resolveTenantId(req);
    const userId = await this.resolveUserId(req);

    // Honor an inbound `x-request-id` (e.g. set by a load balancer) so logs
    // correlate end-to-end; otherwise mint a fresh UUID. Always echo it back
    // in the response so clients can quote it in support requests.
    const inbound = req.headers['x-request-id'];
    const requestId =
      typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 128
        ? inbound
        : randomUUID();
    res.setHeader('x-request-id', requestId);

    TenantContext.run(
      { tenantId, userId, requestId, changes: [], changeReason: null },
      () => next(),
    );
  }

  private async resolveTenantId(req: Request): Promise<string | null> {
    const slug = this.subdomainSlug(req.hostname);
    if (slug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (tenant) return tenant.id;
    }

    const claim = await this.tryJwtClaim(req, 'tid');
    return claim ?? null;
  }

  private async resolveUserId(req: Request): Promise<string | null> {
    return (await this.tryJwtClaim(req, 'sub')) ?? null;
  }

  private subdomainSlug(hostname: string): string | null {
    if (!hostname || hostname === 'localhost') return null;
    if (!hostname.endsWith(this.rootDomain)) return null;
    const left = hostname.slice(0, -(this.rootDomain.length + 1));
    if (!left || left === 'www' || left === 'app' || left === 'marketing')
      return null;
    return left.toLowerCase();
  }

  private async tryJwtClaim(
    req: Request,
    claim: 'tid' | 'sub',
  ): Promise<string | null> {
    const token = extractAccessTokenForContext(req);
    if (!token) return null;
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) return null;
    try {
      const payload = await verifyJwt(token, { secret });
      return claim === 'tid' ? payload.tid : payload.sub;
    } catch {
      // bad token will be rejected by JwtAuthGuard; here we just don't set context
      return null;
    }
  }
}

/** Header wins over cookie so a service caller can override the browser. */
function extractAccessTokenForContext(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  const c = cookies?.['cliniq.access'];
  return typeof c === 'string' && c.length > 0 ? c : null;
}

/**
 * AsyncLocalStorage-backed tenant context. Use TenantContext.current() inside
 * any service to know who the request belongs to. Use TenantContext.run() in
 * background jobs that don't have a request lifecycle.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One field a service changed during this request.
 *
 * Declared here rather than imported from the audit module so that common/
 * does not depend on a feature module; `FieldChange` in
 * ../audit/changes.ts is structurally identical, so either side assigns to
 * the other without a cast.
 */
export interface AuditedChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface RequestContext {
  tenantId: string | null;
  userId: string | null;
  requestId: string | null;
  /**
   * Appended by services as they mutate things, drained by AuditInterceptor
   * when the request succeeds. Lives on the request context rather than being
   * threaded through service signatures, because the alternative is a
   * parameter on every mutating method in the application.
   */
  changes?: AuditedChange[];
  /** The stated reason for those changes, where the request carried one. */
  changeReason?: string | null;
}

class TenantContextImpl {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  run<T>(ctx: RequestContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  current(): RequestContext {
    return (
      this.als.getStore() ?? { tenantId: null, userId: null, requestId: null }
    );
  }

  requireTenant(): string {
    const id = this.current().tenantId;
    if (!id) throw new Error('TenantContext: no active tenant');
    return id;
  }

  requestId(): string | null {
    return this.als.getStore()?.requestId ?? null;
  }

  /**
   * Record what a service just changed, for the audit interceptor to pick up.
   *
   * Reads the store directly rather than going through `current()`, which
   * returns a fresh object when there is none — pushing into that would
   * silently discard the changes. Outside a request (background jobs, tests
   * calling a service directly) this is a no-op, which is the right
   * behaviour: there is no audit row to attach them to.
   */
  addChanges(changes: readonly AuditedChange[], reason?: string | null): void {
    const store = this.als.getStore();
    if (!store || changes.length === 0) {
      // A reason with no changes is not worth an entry, but a reason given
      // alongside changes recorded by an earlier call in the same request is.
      if (store && reason) store.changeReason = reason;
      return;
    }
    (store.changes ??= []).push(...changes);
    if (reason) store.changeReason = reason;
  }

  /**
   * Take everything recorded so far and clear it.
   *
   * Cleared on read so that a second audited action in the same request —
   * an interceptor firing for a nested call — cannot inherit the first one's
   * changes and report them twice.
   */
  drainChanges(): { changes: AuditedChange[]; reason: string | null } {
    const store = this.als.getStore();
    if (!store) return { changes: [], reason: null };
    const changes = store.changes ?? [];
    const reason = store.changeReason ?? null;
    store.changes = [];
    store.changeReason = null;
    return { changes, reason };
  }
}

export const TenantContext = new TenantContextImpl();
