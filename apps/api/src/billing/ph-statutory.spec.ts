import {
  PH_DEFAULT_RULES,
  applyStatutoryDiscount,
  entitlementIsActive,
  selectEntitlement,
} from './ph-statutory.js';

const SENIOR = PH_DEFAULT_RULES.SENIOR_CITIZEN;
const VAT = 12;

describe('applyStatutoryDiscount — the worked example', () => {
  it('splits a ₱1,120 VAT-inclusive charge the way the BIR requires', () => {
    // ₱1,000 + 12% VAT. This is the canonical case from every BIR circular
    // on RA 9994, and the one worth being able to check by eye.
    const b = applyStatutoryDiscount(112_000, VAT, SENIOR);
    expect(b.vatExemptSaleCentavos).toBe(100_000);
    expect(b.discountCentavos).toBe(20_000);
    expect(b.vatCentavos).toBe(0);
    expect(b.netCentavos).toBe(80_000);
  });

  it('does not take the 20% off the VAT-inclusive price', () => {
    // The mistake this module exists to prevent. 20% of ₱1,120 is ₱224, and
    // both routes collect ₱800 — but ₱224 is not the deductible figure, and
    // claiming it overstates the deduction on every transaction.
    const b = applyStatutoryDiscount(112_000, VAT, SENIOR);
    expect(b.discountCentavos).not.toBe(22_400);
    expect(b.discountCentavos).toBe(20_000);
  });
});

describe('applyStatutoryDiscount', () => {
  it('reconciles: sale − discount + vat === net', () => {
    // Rounding each part independently is how an invoice ends up a centavo
    // short of itself. Check across awkward amounts, not just round ones.
    for (const gross of [1, 99, 100, 333, 112_000, 99_999, 1_234_567]) {
      const b = applyStatutoryDiscount(gross, VAT, SENIOR);
      expect(b.vatExemptSaleCentavos - b.discountCentavos + b.vatCentavos).toBe(
        b.netCentavos,
      );
    }
  });

  it('never returns more than the patient was charged', () => {
    for (const gross of [1, 50, 333, 112_000, 999_999]) {
      const b = applyStatutoryDiscount(gross, VAT, SENIOR);
      expect(b.netCentavos).toBeLessThanOrEqual(gross);
      expect(b.discountCentavos).toBeLessThanOrEqual(b.vatExemptSaleCentavos);
      expect(b.netCentavos).toBeGreaterThanOrEqual(0);
    }
  });

  it('applies the 20% to the gross when the clinic charges no VAT', () => {
    // A clinic below the VAT threshold, or one whose services are VAT-exempt
    // under NIRC §109(G), quotes VAT-exclusive prices — there is nothing to
    // strip, and the discount is simply 20%.
    const b = applyStatutoryDiscount(100_000, 0, SENIOR);
    expect(b.vatExemptSaleCentavos).toBe(100_000);
    expect(b.discountCentavos).toBe(20_000);
    expect(b.netCentavos).toBe(80_000);
  });

  it('still charges VAT for a rule that discounts without exempting', () => {
    // Not RA 9994 or RA 10754 — but a tenant may configure a commercial
    // discount through the same machinery, and it must not silently drop VAT.
    const b = applyStatutoryDiscount(100_000, VAT, {
      percent: 10,
      vatExempt: false,
    });
    expect(b.vatExemptSaleCentavos).toBe(100_000);
    expect(b.discountCentavos).toBe(10_000);
    expect(b.vatCentavos).toBe(10_800); // 12% of 90,000
    expect(b.netCentavos).toBe(100_800);
  });

  it('handles zero without dividing by anything awkward', () => {
    const b = applyStatutoryDiscount(0, VAT, SENIOR);
    expect(b).toMatchObject({
      vatExemptSaleCentavos: 0,
      discountCentavos: 0,
      vatCentavos: 0,
      netCentavos: 0,
    });
  });

  it('handles a one-centavo charge without going negative', () => {
    const b = applyStatutoryDiscount(1, VAT, SENIOR);
    expect(b.netCentavos).toBeGreaterThanOrEqual(0);
    expect(b.netCentavos).toBeLessThanOrEqual(1);
  });

  it('refuses inputs that cannot mean anything', () => {
    expect(() => applyStatutoryDiscount(-1, VAT, SENIOR)).toThrow(RangeError);
    expect(() => applyStatutoryDiscount(100, -1, SENIOR)).toThrow(RangeError);
    expect(() =>
      applyStatutoryDiscount(100, VAT, { percent: 101, vatExempt: true }),
    ).toThrow(RangeError);
    expect(() =>
      applyStatutoryDiscount(100, VAT, { percent: -1, vatExempt: true }),
    ).toThrow(RangeError);
  });

  it('is exact on amounts that divide cleanly by 1.12', () => {
    // 11,200 centavos = ₱112.00 -> ₱100.00 exempt sale.
    expect(applyStatutoryDiscount(11_200, VAT, SENIOR)).toMatchObject({
      vatExemptSaleCentavos: 10_000,
      discountCentavos: 2_000,
      netCentavos: 8_000,
    });
  });
});

describe('selectEntitlement', () => {
  const senior = { type: 'SENIOR_CITIZEN' as const, rule: SENIOR };
  const pwd = { type: 'PWD' as const, rule: PH_DEFAULT_RULES.PWD };

  it('returns nothing when the patient holds none', () => {
    expect(selectEntitlement([])).toBeNull();
  });

  it('picks one when the patient holds both — the benefits do not stack', () => {
    // A senior who is also a PWD gets ONE 20% discount, not 40%. RA 10754's
    // IRR is explicit that they are not cumulative for the same purchase.
    const chosen = selectEntitlement([senior, pwd]);
    expect(chosen).not.toBeNull();
    expect([senior, pwd]).toContainEqual(chosen);
  });

  it('picks the more favourable one when they differ', () => {
    const weak = {
      type: 'PWD' as const,
      rule: { percent: 5, vatExempt: false },
    };
    expect(selectEntitlement([weak, senior])).toBe(senior);
  });

  it('prefers a VAT-exempting rule at equal percentages', () => {
    const noVatRelief = {
      type: 'PWD' as const,
      rule: { percent: 20, vatExempt: false },
    };
    expect(selectEntitlement([noVatRelief, senior])).toBe(senior);
  });

  it('does not mutate the caller’s array', () => {
    const held = [pwd, senior];
    selectEntitlement(held);
    expect(held[0]).toBe(pwd);
  });
});

describe('entitlementIsActive', () => {
  const at = new Date('2026-09-24T00:00:00Z');

  it('accepts an open-ended entitlement', () => {
    expect(entitlementIsActive({ validFrom: null, validUntil: null }, at)).toBe(
      true,
    );
  });

  it('rejects one that has not started', () => {
    expect(
      entitlementIsActive(
        { validFrom: new Date('2026-10-01T00:00:00Z'), validUntil: null },
        at,
      ),
    ).toBe(false);
  });

  it('rejects an expired one', () => {
    // A PWD ID with an expiry that has passed is not a valid claim.
    expect(
      entitlementIsActive(
        { validFrom: null, validUntil: new Date('2026-09-01T00:00:00Z') },
        at,
      ),
    ).toBe(false);
  });

  it('is inclusive at both ends', () => {
    expect(entitlementIsActive({ validFrom: at, validUntil: at }, at)).toBe(
      true,
    );
  });
});
