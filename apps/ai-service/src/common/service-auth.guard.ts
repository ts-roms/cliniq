import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { SKIP_SERVICE_AUTH_KEY } from './public.decorator.js';

/**
 * Service-to-service authentication for the ai-service. The api process
 * proves identity by sending `X-AI-Service-Token: <shared-secret>`. In
 * production both services run in the same VPC and the secret is injected
 * from SSM; in local dev the token is read from `.env`.
 *
 * Behavior:
 *   - If `AI_SERVICE_TOKEN` is unset: log a warning once and allow all
 *     traffic. Keeps local "Option B" dev (cp .env.example .env && go)
 *     working without forcing the developer to invent a secret.
 *   - If set: compare in constant time. Reject with 401 on mismatch and
 *     when the header is absent.
 *   - `@SkipServiceAuth()` opts a route out (used by /ai/health).
 *
 * This guard runs globally via APP_GUARD; routes that should be reachable
 * by uninitiated callers (the liveness probe) must explicitly opt out.
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);
  private readonly expectedToken: Buffer | null;
  private warnedAboutMissingToken = false;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {
    const token = this.config.get<string>('AI_SERVICE_TOKEN');
    this.expectedToken =
      typeof token === 'string' && token.length > 0
        ? Buffer.from(token, 'utf8')
        : null;
  }

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_SERVICE_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    if (!this.expectedToken) {
      if (!this.warnedAboutMissingToken) {
        this.warnedAboutMissingToken = true;
        this.logger.warn(
          'AI_SERVICE_TOKEN is not set — ai-service is accepting unauthenticated calls. ' +
            'This is fine for local dev but NEVER acceptable in production. Set the env var.',
        );
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const raw = req.headers['x-ai-service-token'];
    const presented = Array.isArray(raw) ? raw[0] : raw;
    if (typeof presented !== 'string' || presented.length === 0) {
      throw new UnauthorizedException('Missing X-AI-Service-Token');
    }

    const a = Buffer.from(presented, 'utf8');
    const b = this.expectedToken;
    // timingSafeEqual requires same-length buffers; pad shorter side to b.length
    // by failing fast on length mismatch (doesn't leak content because length
    // is already observable from the presented header).
    if (a.length !== b.length) {
      throw new UnauthorizedException('Invalid X-AI-Service-Token');
    }
    if (!timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid X-AI-Service-Token');
    }
    return true;
  }
}
