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
  type DentalLabPlan,
} from '@org/shared-types';
import { useQuery } from '@tanstack/react-query';
import { authControllerMe } from '@org/api-client';
import { useSession } from './hooks/use-session';

export interface Entitlements {
  /** Active clinic plan, or null for lab tenants / pre-plan rows. */
  plan: Plan | null;
  /** Active lab plan, or null for clinic tenants / pre-plan rows. */
  labPlan: DentalLabPlan | null;
  /** True iff the active plan unlocks `feature`. */
  hasFeature(feature: Feature): boolean;
  /** The lowest plan (clinic or lab, matching tenantKind) that includes the
   *  given feature, or null if no plan in the ladder offers it. Used to
   *  render "Upgrade to PRO" / "PREMIUM" hints. */
  requiredPlanFor(feature: Feature): Plan | DentalLabPlan | null;
}

const CLINIC_LADDER: Plan[] = ['STARTER', 'PRO', 'PREMIUM'];
const LAB_LADDER: DentalLabPlan[] = [
  'LAB_BASIC',
  'LAB_STANDARD',
  'LAB_PREMIUM',
];

interface LiveMe {
  tenantKind?: 'CLINIC' | 'LAB';
  plan?: Plan | null;
  labPlan?: DentalLabPlan | null;
}

export function useEntitlements(): Entitlements {
  const session = useSession();
  // The session's plan is a snapshot from sign-in. /auth/me returns the
  // tenant's current plan, so an upgrade (or a trial change) unlocks
  // modules without signing out. Session values remain the fallback while
  // the query loads or if it fails.
  const live = useQuery({
    queryKey: ['auth', 'me', session?.user.id ?? null],
    queryFn: async (): Promise<LiveMe> => {
      const { data, error } = await authControllerMe();
      if (error || !data) throw new Error('Failed to load entitlements');
      return data as unknown as LiveMe;
    },
    enabled: !!session,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const plan = (live.data?.plan ?? session?.user.plan ?? null) as Plan | null;
  const labPlan = (live.data?.labPlan ??
    session?.user.labPlan ??
    null) as DentalLabPlan | null;
  const isLab = (live.data?.tenantKind ?? session?.user.tenantKind) === 'LAB';

  return useMemo<Entitlements>(
    () => ({
      plan,
      labPlan,
      hasFeature(feature: Feature): boolean {
        if (isLab) return labPlan ? labPlanHasFeature(labPlan, feature) : false;
        return plan ? planHasFeature(plan, feature) : false;
      },
      requiredPlanFor(feature: Feature): Plan | DentalLabPlan | null {
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
