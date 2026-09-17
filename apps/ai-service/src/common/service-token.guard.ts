import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { secretsEqual } from '@org/auth';

export const SERVICE_TOKEN_HEADER = 'x-ai-service-token';

/** Routes any caller may hit without the shared secret. */
const OPEN_PATHS = new Set(['/ai', '/ai/', '/ai/health', '/ai/health/']);

/**
 * The ai-service is only ever called by the api; it has no end-user auth
 * of its own. Without this guard, anything that can reach port 4100
 * (a mis-scoped security group, a Railway public domain left on) can burn
 * Bedrock budget and push PHI through the prompts. The api sends
 * AI_SERVICE_TOKEN in the X-AI-Service-Token header; both sides read the
 * same env var.
 *
 * Unset token:
 *   - NODE_ENV=production -> refuse to boot (see main.ts)
 *   - otherwise           -> warn once, allow (local dev + CI stub)
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name);
  private readonly expected: string | undefined;
  private warned = false;

  constructor(config: ConfigService) {
    const raw = config.get<string>('AI_SERVICE_TOKEN');
    this.expected = raw && raw.length > 0 ? raw : undefined;
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      path?: string;
      url?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const path = (req.path ?? req.url ?? '').split('?')[0];
    if (OPEN_PATHS.has(path) || path.startsWith('/ai/docs')) return true;

    if (!this.expected) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          'AI_SERVICE_TOKEN is not set — accepting unauthenticated calls. Set it in every deployed environment.',
        );
      }
      return true;
    }

    const raw = req.headers[SERVICE_TOKEN_HEADER];
    const presented = Array.isArray(raw) ? raw[0] : raw;
    if (!secretsEqual(presented, this.expected)) {
      throw new UnauthorizedException('missing or invalid service token');
    }
    return true;
  }
}
