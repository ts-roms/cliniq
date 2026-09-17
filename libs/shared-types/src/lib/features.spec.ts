import { describe, expect, it } from '@jest/globals';
import {
  Features,
  LAB_PLAN_FEATURES,
  PLAN_FEATURES,
  PLAN_META,
  labPlanHasFeature,
  planHasFeature,
} from './features';

describe('plan ladders', () => {
  it('each clinic tier is a strict superset of the one below', () => {
    for (const f of PLAN_FEATURES.STARTER)
      expect(PLAN_FEATURES.PRO.has(f)).toBe(true);
    for (const f of PLAN_FEATURES.PRO)
      expect(PLAN_FEATURES.PREMIUM.has(f)).toBe(true);
    expect(PLAN_FEATURES.PREMIUM.size).toBeGreaterThan(PLAN_FEATURES.PRO.size);
    expect(PLAN_FEATURES.PRO.size).toBeGreaterThan(PLAN_FEATURES.STARTER.size);
  });

  it('each lab tier is a strict superset of the one below', () => {
    for (const f of LAB_PLAN_FEATURES.LAB_BASIC)
      expect(LAB_PLAN_FEATURES.LAB_STANDARD.has(f)).toBe(true);
    for (const f of LAB_PLAN_FEATURES.LAB_STANDARD)
      expect(LAB_PLAN_FEATURES.LAB_PREMIUM.has(f)).toBe(true);
  });

  it('sets contain only feature strings (a nested Set means a broken spread)', () => {
    for (const set of [
      ...Object.values(PLAN_FEATURES),
      ...Object.values(LAB_PLAN_FEATURES),
    ]) {
      for (const f of set) expect(typeof f).toBe('string');
    }
    for (const meta of Object.values(PLAN_META)) {
      for (const f of meta.features) expect(typeof f).toBe('string');
    }
  });

  it('PREMIUM keeps the PRO-tier AI scribe', () => {
    expect(planHasFeature('PRO', Features.AI_SOAP)).toBe(true);
    expect(planHasFeature('PREMIUM', Features.AI_SOAP)).toBe(true);
    expect(planHasFeature('STARTER', Features.AI_SOAP)).toBe(false);
    expect(labPlanHasFeature('LAB_PREMIUM', Features.LAB_ORDERS)).toBe(true);
  });
});
