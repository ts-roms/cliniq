import {
  Features,
  PLAN_FEATURES,
  LAB_PLAN_FEATURES,
  planHasFeature,
  labPlanHasFeature,
  type Plan,
  type DentalLabPlan,
  type Feature,
} from './features.js';

/**
 * Regression tests for the plan → features mapping.
 *
 * Background: an earlier version of this file built the per-tier Sets via
 * Set-spread (`new Set([...STARTER_FEATURES, ...PRO_FEATURES, ...])`), which
 * SWC lowered to `new Set([].concat(STARTER_FEATURES, [...]))` in the bundled
 * output. Because `Array.prototype.concat` does NOT iterate a Set — it
 * appends it as a single nested member — PRO_FEATURES silently lost
 * STARTER's features, and PREMIUM_FEATURES lost both STARTER's and PRO's.
 * The result was 402 "plan PREMIUM does not include: labs" errors against
 * every gated endpoint.
 *
 * These tests would have caught that bundling bug: they don't just assert
 * the source's intent, they actually verify the runtime Set membership.
 */

describe('PLAN_FEATURES (clinic ladder)', () => {
  it('STARTER includes core EMR and basic reports', () => {
    expect(PLAN_FEATURES.STARTER.has(Features.CORE_EMR)).toBe(true);
    expect(PLAN_FEATURES.STARTER.has(Features.REPORTS_BASIC)).toBe(true);
  });

  it('STARTER does NOT include PRO-tier features', () => {
    expect(PLAN_FEATURES.STARTER.has(Features.INVENTORY)).toBe(false);
    expect(PLAN_FEATURES.STARTER.has(Features.HMO)).toBe(false);
    expect(PLAN_FEATURES.STARTER.has(Features.LABS)).toBe(false);
    expect(PLAN_FEATURES.STARTER.has(Features.AI_SOAP)).toBe(false);
  });

  it('PRO strictly includes everything in STARTER', () => {
    for (const f of PLAN_FEATURES.STARTER) {
      expect(PLAN_FEATURES.PRO.has(f)).toBe(true);
    }
  });

  it('PRO adds INVENTORY/LABS/HMO/TELEMEDICINE/AI_SOAP/QUEUEING/OB/ULTRASOUND_2D', () => {
    const proAdds: Feature[] = [
      Features.REPORTS_ADVANCED,
      Features.INVENTORY,
      Features.LABS,
      Features.HMO,
      Features.TELEMEDICINE,
      Features.AI_SOAP,
      Features.QUEUEING,
      Features.OBSTETRICS,
      Features.ULTRASOUND_2D,
    ];
    for (const f of proAdds) {
      expect(PLAN_FEATURES.PRO.has(f)).toBe(true);
    }
  });

  it('PREMIUM strictly includes everything in PRO (and therefore STARTER)', () => {
    for (const f of PLAN_FEATURES.PRO) {
      expect(PLAN_FEATURES.PREMIUM.has(f)).toBe(true);
    }
  });

  it('PREMIUM adds AI_DERMATOLOGY/WEBHOOKS/CALENDAR_SYNC/CUSTOM_RETENTION/QUEUEING_DRIVE_THRU/QUEUEING_KIOSK/ULTRASOUND_3D_4D', () => {
    const premiumAdds: Feature[] = [
      Features.AI_DERMATOLOGY,
      Features.WEBHOOKS,
      Features.CALENDAR_SYNC,
      Features.CUSTOM_RETENTION,
      Features.QUEUEING_DRIVE_THRU,
      Features.QUEUEING_KIOSK,
      Features.ULTRASOUND_3D_4D,
    ];
    for (const f of premiumAdds) {
      expect(PLAN_FEATURES.PREMIUM.has(f)).toBe(true);
    }
  });

  it('Sets contain plain string features (no nested Set objects)', () => {
    // Defensive check against the historical SWC `[...Set]` → `concat(Set)`
    // lowering bug. Every member must be a string Feature literal — if a
    // bundler regressed and started nesting Sets again, this would fail.
    for (const plan of ['STARTER', 'PRO', 'PREMIUM'] as const) {
      for (const member of PLAN_FEATURES[plan as Plan]) {
        expect(typeof member).toBe('string');
      }
    }
  });

  it('planHasFeature reflects the Set membership', () => {
    expect(planHasFeature('PREMIUM', Features.LABS)).toBe(true);
    expect(planHasFeature('STARTER', Features.LABS)).toBe(false);
    expect(planHasFeature('PRO', Features.AI_DERMATOLOGY)).toBe(false);
    expect(planHasFeature('PREMIUM', Features.AI_DERMATOLOGY)).toBe(true);
  });
});

describe('LAB_PLAN_FEATURES (lab ladder)', () => {
  it('LAB_BASIC includes core lab features', () => {
    expect(LAB_PLAN_FEATURES.LAB_BASIC.has(Features.LAB_CATALOG)).toBe(true);
    expect(LAB_PLAN_FEATURES.LAB_BASIC.has(Features.LAB_ORDERS)).toBe(true);
  });

  it('LAB_STANDARD strictly includes everything in LAB_BASIC', () => {
    for (const f of LAB_PLAN_FEATURES.LAB_BASIC) {
      expect(LAB_PLAN_FEATURES.LAB_STANDARD.has(f)).toBe(true);
    }
  });

  it('LAB_STANDARD adds phase tracking, chat, materials, payment links', () => {
    expect(LAB_PLAN_FEATURES.LAB_STANDARD.has(Features.LAB_PHASES)).toBe(true);
    expect(LAB_PLAN_FEATURES.LAB_STANDARD.has(Features.LAB_CHAT)).toBe(true);
    expect(LAB_PLAN_FEATURES.LAB_STANDARD.has(Features.LAB_MATERIALS_LOT)).toBe(
      true,
    );
    expect(LAB_PLAN_FEATURES.LAB_STANDARD.has(Features.LAB_PAYMENT_LINKS)).toBe(
      true,
    );
  });

  it('LAB_PREMIUM strictly includes everything in LAB_STANDARD', () => {
    for (const f of LAB_PLAN_FEATURES.LAB_STANDARD) {
      expect(LAB_PLAN_FEATURES.LAB_PREMIUM.has(f)).toBe(true);
    }
  });

  it('LAB_PREMIUM adds treatment plans, AI assist, e-invoice, 3D viewer', () => {
    expect(LAB_PLAN_FEATURES.LAB_PREMIUM.has(Features.LAB_TREATMENT_PLAN)).toBe(
      true,
    );
    expect(LAB_PLAN_FEATURES.LAB_PREMIUM.has(Features.LAB_AI_ASSIST)).toBe(
      true,
    );
    expect(LAB_PLAN_FEATURES.LAB_PREMIUM.has(Features.LAB_EINVOICE)).toBe(true);
    expect(LAB_PLAN_FEATURES.LAB_PREMIUM.has(Features.LAB_3D_VIEWER)).toBe(
      true,
    );
  });

  it('Sets contain plain string features (no nested Set objects)', () => {
    for (const plan of ['LAB_BASIC', 'LAB_STANDARD', 'LAB_PREMIUM'] as const) {
      for (const member of LAB_PLAN_FEATURES[plan as DentalLabPlan]) {
        expect(typeof member).toBe('string');
      }
    }
  });

  it('labPlanHasFeature reflects the Set membership', () => {
    expect(labPlanHasFeature('LAB_BASIC', Features.LAB_CATALOG)).toBe(true);
    expect(labPlanHasFeature('LAB_BASIC', Features.LAB_PHASES)).toBe(false);
    expect(labPlanHasFeature('LAB_STANDARD', Features.LAB_PHASES)).toBe(true);
    expect(labPlanHasFeature('LAB_STANDARD', Features.LAB_AI_ASSIST)).toBe(
      false,
    );
    expect(labPlanHasFeature('LAB_PREMIUM', Features.LAB_AI_ASSIST)).toBe(true);
  });
});

describe('Cross-ladder isolation', () => {
  it('Clinic plans do not contain lab-specific features', () => {
    expect(PLAN_FEATURES.PREMIUM.has(Features.LAB_TREATMENT_PLAN)).toBe(false);
    expect(PLAN_FEATURES.PREMIUM.has(Features.LAB_CATALOG)).toBe(false);
  });

  it('Lab plans do not contain clinic-specific features', () => {
    expect(LAB_PLAN_FEATURES.LAB_PREMIUM.has(Features.HMO)).toBe(false);
    expect(LAB_PLAN_FEATURES.LAB_PREMIUM.has(Features.OBSTETRICS)).toBe(false);
  });
});
