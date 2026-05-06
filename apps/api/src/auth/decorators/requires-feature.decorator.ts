import { SetMetadata } from '@nestjs/common';
import type { Feature } from '@org/shared-types';

export const REQUIRES_FEATURE_KEY = 'requires_feature';

/**
 * Gate a controller or route on the caller's tenant subscription plan.
 * The FeatureGuard reads this metadata, looks up the tenant's `plan`,
 * and 402-Payment-Required's the request if the feature isn't unlocked.
 *
 * Multiple features = ALL must be unlocked (AND semantics).
 */
export const RequiresFeature = (...features: Feature[]) =>
  SetMetadata(REQUIRES_FEATURE_KEY, features);
