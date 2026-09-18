import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TenantContext } from './tenant-context.middleware.js';

// Duck-type Prisma errors so we don't depend on the generated client's
// internal `Prisma` namespace path. Every PrismaClientKnownRequestError has
// a string `code` starting with 'P' and a `name` ending in 'RequestError'.
interface PrismaCodedError extends Error {
  code: string;
  meta?: Record<string, unknown>;
}
function isPrismaKnownError(e: unknown): e is PrismaCodedError {
  return (
    e instanceof Error &&
    typeof (e as { code?: unknown }).code === 'string' &&
    (e as unknown as { code: string }).code.startsWith('P') &&
    e.name === 'PrismaClientKnownRequestError'
  );
}
function isPrismaValidationError(e: unknown): e is Error {
  return e instanceof Error && e.name === 'PrismaClientValidationError';
}

/**
 * Global exception filter — runs for every uncaught error in the request
 * pipeline. Three goals:
 *   1. Always respond with a consistent JSON envelope so the api-client and
 *      the web error boundaries can rely on `{ statusCode, error, message }`.
 *   2. Attach the request-id to both the response body and a log line so
 *      a user-quoted id maps to a stack in the server logs.
 *   3. Translate Prisma errors into safe HTTP statuses without leaking the
 *      database error text (which can include column names / sample data).
 *
 * Order of recognition (most-specific first):
 *   - HttpException (let Nest's own response shape inform statusCode/message)
 *   - Prisma known request error (P2002 unique, P2025 not found, etc.)
 *   - Prisma validation error
 *   - Everything else → 500 with a generic message; the real error is logged.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = TenantContext.requestId();

    const { status, error, message, details, extra } =
      this.translate(exception);

    // The Logger.error overload takes (message, stack?, context?). Build a
    // single structured-ish line so external log scrapers can index on the
    // request id and tenant id without us forcing a Pino migration today.
    const tenantId = TenantContext.current().tenantId ?? '-';
    const userId = TenantContext.current().userId ?? '-';
    const stack = exception instanceof Error ? exception.stack : undefined;
    this.logger.error(
      `[${requestId ?? '-'}] ${req.method} ${req.originalUrl} -> ${status} ${error}: ${message} tenant=${tenantId} user=${userId}`,
      stack,
    );

    const body: Record<string, unknown> = {
      ...extra,
      statusCode: status,
      error,
      message,
      requestId,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    if (details !== undefined) body['details'] = details;

    res.status(status).json(body);
  }

  private translate(exception: unknown): {
    status: number;
    error: string;
    message: string;
    details?: unknown;
    /** Structured fields a handler put on its HttpException body (e.g.
     *  `mfaRequired`, `missingFeatures`, `overridable`, `problems`). */
    extra?: Record<string, unknown>;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        return { status, error: HttpException.name, message: resp };
      }
      const obj = resp as Record<string, unknown>;
      const error =
        typeof obj['error'] === 'string'
          ? (obj['error'] as string)
          : HttpException.name;
      const messageRaw = obj['message'];
      const message =
        typeof messageRaw === 'string'
          ? messageRaw
          : Array.isArray(messageRaw)
            ? messageRaw.join('; ')
            : exception.message;
      // Keep whatever else the handler attached — clients branch on these
      // (login's `mfaRequired`, the feature guard's `missingFeatures`, the
      // appointment 422's `reason` / `overridable`, validation `problems`).
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'statusCode' || k === 'error' || k === 'message') continue;
        extra[k] = v;
      }
      return {
        status,
        error,
        message,
        details:
          Array.isArray(messageRaw) && messageRaw.length > 1
            ? messageRaw
            : undefined,
        extra: Object.keys(extra).length > 0 ? extra : undefined,
      };
    }

    if (isPrismaKnownError(exception)) {
      // Map the most-trafficked error codes to HTTP. Anything we don't know
      // about becomes a generic 400 — never echo Prisma's `meta` because it
      // can include column names or sample row data.
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            error: 'Conflict',
            message: 'Resource already exists',
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: 'Resource not found',
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: 'Foreign key constraint failed',
          };
        case 'P2014':
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: 'Relation constraint violated',
          };
        default:
          return {
            status: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: 'Database request failed',
          };
      }
    }

    if (isPrismaValidationError(exception)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Database validation failed',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Unexpected error',
    };
  }
}
