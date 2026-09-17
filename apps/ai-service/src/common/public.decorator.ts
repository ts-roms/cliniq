import { SetMetadata } from '@nestjs/common';

export const SKIP_SERVICE_AUTH_KEY = 'skipServiceAuth';

/**
 * Opt a route or controller out of the global ServiceAuthGuard. Use sparingly
 * — only for routes that must be reachable without the shared secret (e.g.,
 * the load-balancer health check).
 */
export const SkipServiceAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_SERVICE_AUTH_KEY, true);
