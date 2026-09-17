import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { TenantContext } from './tenant-context.middleware.js';

/**
 * One log line per request, after the response is written. Combined with the
 * request-id middleware and the AllExceptionsFilter, this means every line
 * (success or failure) carries the same `requestId` and can be grep-joined.
 *
 * Quiet on the noisy probes (`/api/health`) — readiness pings every few
 * seconds otherwise drown out signal.
 *
 * Format: `<method> <url> <status> <ms>ms tenant=<tid> user=<uid> req=<rid>`
 * — keep it greppable, not JSON, until we move to Pino.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    if (req.originalUrl?.startsWith('/api/health')) return next.handle();

    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.log(req, res, started),
        error: () => this.log(req, res, started, true),
      }),
    );
  }

  private log(
    req: Request,
    res: Response,
    started: number,
    errored = false,
  ): void {
    const dur = Date.now() - started;
    const status = res.statusCode;
    const { tenantId, userId, requestId } = TenantContext.current();
    const line = `${req.method} ${req.originalUrl} ${status} ${dur}ms tenant=${tenantId ?? '-'} user=${userId ?? '-'} req=${requestId ?? '-'}`;
    if (errored || status >= 500) this.logger.error(line);
    else if (status >= 400) this.logger.warn(line);
    else this.logger.log(line);
  }
}
