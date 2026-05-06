import { SetMetadata } from '@nestjs/common';

export const IS_PLATFORM_KEY = 'is_platform';

/**
 * Marks a controller (or single route) as platform-admin-scoped.
 *
 * Effect on the global guard chain:
 *   - JwtAuthGuard returns true (skips — platform auth lives in PlatformAuthGuard)
 *   - PlatformAuthGuard runs (verifies cliniq-platform audience)
 *   - RbacGuard returns true (skips — no tenant role)
 *   - FeatureGuard returns true (skips — no tenant plan)
 *
 * Apply at the controller level. Combine with @Public on truly anonymous
 * routes (e.g. POST /platform/auth/login).
 */
export const PlatformAuth = () => SetMetadata(IS_PLATFORM_KEY, true);
