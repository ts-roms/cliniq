'use client';

// Plan-aware entitlement helpers. Reads the current tenant's plan out of the
// session (which got it from /auth/login → `user.plan` / `user.labPlan`) and
// answers "does this feature belong to my plan?".
//
// Used by the UI shell (side nav, page guards, action buttons) to render
// disabled state for features behind a higher tier — see SideNav for the
// canonical pattern. The api enforces the same gate via FeatureGuard;
// this helper only controls VISIBILITY, not security.
//
// If `plan` / `labPlan` is missing from the session (older client, or a
// pre-plan tenant), every feature returns false. The UI should treat that
// as "show the upgrade badge" rather than "secretly grant access".

import { useMemo } from 'react';
import {
  Features,
  PLAN_FEATURES,
  LAB_PLAN_FEATURES,
  planHasFeature,
  labPlanHasFeature,
  type Feature,
  type Plan,
  type LabPlan,
} from '@org/shared-types';
import { useSession } from './hooks/use-session';

export interface Entitlements {
  /** Active clinic plan, or null for lab tenants / pre-plan rows. */
  plan: Plan | null;
  /** Active lab plan, or null for clinic tenants / pre-plan rows. */
  labPlan: LabPlan | null;
  /** True iff the active plan unlocks `feature`. */
  hasFeature(feature: Feature): boolean;
  /** The lowest plan (clinic or lab, matching tenantKind) that includes the
   *  given feature, or null if no plan in the ladder offers it. Used to
   *  render "Upgrade to PRO" / "PREMIUM" hints. */
  requiredPlanFor(feature: Feature): Plan | LabPlan | null;
}

const CLINIC_LADDER: Plan[] = ['STARTER', 'PRO', 'PREMIUM'];
const LAB_LADDER: LabPlan[] = ['LAB_BASIC', 'LAB_STANDARD', 'LAB_PREMIUM'];

export function useEntitlements(): Entitlements {
  const session = useSession();
  const plan = (session?.user.plan ?? null) as Plan | null;
  const labPlan = (session?.user.labPlan ?? null) as LabPlan | null;
  const isLab = session?.user.tenantKind === 'LAB';

  return useMemo<Entitlements>(
    () => ({
      plan,
      labPlan,
      hasFeature(feature: Feature): boolean {
        if (isLab) return labPlan ? labPlanHasFeature(labPlan, feature) : false;
        return plan ? planHasFeature(plan, feature) : false;
      },
      requiredPlanFor(feature: Feature): Plan | LabPlan | null {
        if (isLab) {
          return (
            LAB_LADDER.find((p) => LAB_PLAN_FEATURES[p]?.has(feature)) ?? null
          );
        }
        return (
          CLINIC_LADDER.find((p) => PLAN_FEATURES[p]?.has(feature)) ?? null
        );
      },
    }),
    [plan, labPlan, isLab],
  );
}

// Re-export the canonical Feature catalog so consumers can `requires: Features.INVENTORY`
// without a second import.
export { Features, type Feature };
