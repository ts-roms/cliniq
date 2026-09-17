import type { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Rate limiting. One in-memory `default` bucket keyed by client IP:
 *
 *   THROTTLE_TTL_MS      window length            (default 60 000)
 *   THROTTLE_LIMIT       requests / window / IP   (default 300)
 *   THROTTLE_AUTH_LIMIT  same window, for the credential endpoints
 *                        (login / register / refresh / forgot / reset /
 *                        tenant signup / MFA verify / platform login)
 *                        (default 10)
 *   THROTTLE_DISABLED    "true" turns the guard off entirely — for local
 *                        load tests only; never set in deployed envs.
 *
 * Values are read per-request (Resolvable), not at decoration time, so
 * `.env` loaded by ConfigModule.forRoot is honoured even though the
 * @Throttle decorators run at import time. Storage is in-process; with
 * >1 api replica each replica enforces its own count, which is still a
 * bound — swap in ThrottlerStorageRedis when a shared store exists.
 *
 * Deployed behind ALB / Railway's proxy, `TRUST_PROXY=1` in main.ts makes
 * `req.ip` the real client address instead of the load balancer's.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const throttleTtlMs = (): number => envInt('THROTTLE_TTL_MS', 60_000);
export const throttleLimit = (): number => envInt('THROTTLE_LIMIT', 300);
export const throttleAuthLimit = (): number =>
  envInt('THROTTLE_AUTH_LIMIT', 10);
export const throttleDisabled = (): boolean =>
  process.env['THROTTLE_DISABLED'] === 'true';

/** Pass to `@Throttle(AUTH_THROTTLE)` on credential endpoints. */
export const AUTH_THROTTLE = {
  default: {
    limit: () => throttleAuthLimit(),
    ttl: () => throttleTtlMs(),
  },
};

export function buildThrottlerOptions(): ThrottlerModuleOptions {
  return {
    skipIf: () => throttleDisabled(),
    throttlers: [
      {
        name: 'default',
        limit: () => throttleLimit(),
        ttl: () => throttleTtlMs(),
      },
    ],
    errorMessage: 'too many requests — slow down and try again shortly',
  };
}
