import {
  EXPIRY_WARNING_DAYS,
  calibrationStatus,
  fitnessForTesting,
  reagentLotStatus,
} from './fitness.js';

const AT = new Date('2026-09-25T12:00:00Z');
const days = (n: number) => new Date(AT.getTime() + n * 86_400_000);

describe('calibrationStatus', () => {
  it('reports when nothing has ever been recorded', () => {
    // Distinct from "not due". A machine with no calibration on record is a
    // finding; one calibrated last week is not.
    expect(
      calibrationStatus({ calibratedAt: null, intervalDays: 90 }, AT),
    ).toEqual({ never: true, overdue: false, daysRemaining: null });
  });

  it('reports no interval rather than pretending it is compliant', () => {
    // Treating an unset interval as "never due" is how a machine goes two
    // years without calibration and nothing anywhere says so.
    const s = calibrationStatus(
      { calibratedAt: days(-400), intervalDays: null },
      AT,
    );
    expect(s.overdue).toBe(false);
    expect(s.daysRemaining).toBeNull();
    expect(s.never).toBe(false);
  });

  it('counts down to the next due date', () => {
    const s = calibrationStatus(
      { calibratedAt: days(-30), intervalDays: 90 },
      AT,
    );
    expect(s.overdue).toBe(false);
    expect(s.daysRemaining).toBe(60);
  });

  it('reports overdue with days gone negative', () => {
    const s = calibrationStatus(
      { calibratedAt: days(-100), intervalDays: 90 },
      AT,
    );
    expect(s.overdue).toBe(true);
    expect(s.daysRemaining).toBe(-10);
  });

  it('treats a zero or negative interval as unset', () => {
    for (const intervalDays of [0, -30]) {
      expect(
        calibrationStatus({ calibratedAt: days(-400), intervalDays }, AT)
          .daysRemaining,
      ).toBeNull();
    }
  });
});

describe('reagentLotStatus', () => {
  it('is usable while sealed and in date', () => {
    expect(
      reagentLotStatus(
        { expiresOn: days(90), openedOn: null, openStabilityDays: 30 },
        AT,
      ),
    ).toEqual({
      expired: false,
      openStabilityExceeded: false,
      daysRemaining: 90,
    });
  });

  it('is expired past the printed date', () => {
    const s = reagentLotStatus(
      { expiresOn: days(-1), openedOn: null, openStabilityDays: null },
      AT,
    );
    expect(s.expired).toBe(true);
  });

  it('exceeds in-use stability even with months left on the printed date', () => {
    // The case the inventory model cannot express: a lot three months from
    // its printed expiry, unusable because it was opened five weeks ago.
    const s = reagentLotStatus(
      { expiresOn: days(90), openedOn: days(-35), openStabilityDays: 30 },
      AT,
    );
    expect(s.expired).toBe(false);
    expect(s.openStabilityExceeded).toBe(true);
  });

  it('counts down to whichever limit comes first', () => {
    // Opened 25 days ago with 30-day stability: 5 days left, not the 90 the
    // printed date would suggest.
    const s = reagentLotStatus(
      { expiresOn: days(90), openedOn: days(-25), openStabilityDays: 30 },
      AT,
    );
    expect(s.daysRemaining).toBe(5);
  });

  it('uses the printed date when it is the earlier limit', () => {
    const s = reagentLotStatus(
      { expiresOn: days(3), openedOn: days(-1), openStabilityDays: 30 },
      AT,
    );
    expect(s.daysRemaining).toBe(3);
  });

  it('ignores stability on a sealed vial', () => {
    // The clock starts when it is opened, not when it arrives.
    const s = reagentLotStatus(
      { expiresOn: days(90), openedOn: null, openStabilityDays: 1 },
      AT,
    );
    expect(s.openStabilityExceeded).toBe(false);
    expect(s.daysRemaining).toBe(90);
  });

  it('reports no limit when neither is set', () => {
    expect(
      reagentLotStatus(
        { expiresOn: null, openedOn: null, openStabilityDays: null },
        AT,
      ).daysRemaining,
    ).toBeNull();
  });
});

describe('fitnessForTesting', () => {
  const ok = { status: 'ACTIVE', name: 'Cobas c311' };
  const lot = { name: 'Potassium reagent', lotNumber: 'R-77' };
  const fresh = reagentLotStatus(
    { expiresOn: days(90), openedOn: null, openStabilityDays: null },
    AT,
  );

  it('passes an active analyser with a fresh lot', () => {
    expect(
      fitnessForTesting({
        equipment: ok,
        calibration: null,
        reagentLot: lot,
        reagentStatus: fresh,
      }),
    ).toEqual({ ok: true, warnings: [] });
  });

  it('refuses equipment that is out of service', () => {
    const f = fitnessForTesting({
      equipment: { status: 'MAINTENANCE', name: 'Cobas c311' },
      calibration: null,
      reagentLot: null,
      reagentStatus: null,
    });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toMatch(/maintenance/);
  });

  it('refuses an expired reagent — the number would mean nothing', () => {
    const f = fitnessForTesting({
      equipment: ok,
      calibration: null,
      reagentLot: lot,
      reagentStatus: reagentLotStatus(
        { expiresOn: days(-1), openedOn: null, openStabilityDays: null },
        AT,
      ),
    });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toMatch(/expired/);
  });

  it('refuses a lot past its in-use stability', () => {
    const f = fitnessForTesting({
      equipment: ok,
      calibration: null,
      reagentLot: lot,
      reagentStatus: reagentLotStatus(
        { expiresOn: days(90), openedOn: days(-35), openStabilityDays: 30 },
        AT,
      ),
    });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.reason).toMatch(/in-use stability/);
  });

  it('only WARNS on an overdue calibration', () => {
    // The deliberate asymmetry. An expired reagent produces a number that
    // means nothing; an overdue calibration produces one that is probably
    // fine and possibly drifting. Blocking the second would leave a
    // laboratory unable to report anything the morning a service visit
    // slips, which teaches people to work around the system.
    const f = fitnessForTesting({
      equipment: ok,
      calibration: calibrationStatus(
        { calibratedAt: days(-100), intervalDays: 90 },
        AT,
      ),
      reagentLot: lot,
      reagentStatus: fresh,
    });
    expect(f.ok).toBe(true);
    expect(f.warnings.join(' ')).toMatch(/overdue by 10 day/);
  });

  it('warns when no calibration is on record', () => {
    const f = fitnessForTesting({
      equipment: ok,
      calibration: calibrationStatus(
        { calibratedAt: null, intervalDays: 90 },
        AT,
      ),
      reagentLot: null,
      reagentStatus: null,
    });
    expect(f.ok).toBe(true);
    expect(f.warnings.join(' ')).toMatch(/no calibration on record/);
  });

  it('warns as a lot approaches its limit', () => {
    const f = fitnessForTesting({
      equipment: ok,
      calibration: null,
      reagentLot: lot,
      reagentStatus: reagentLotStatus(
        {
          expiresOn: days(EXPIRY_WARNING_DAYS - 1),
          openedOn: null,
          openStabilityDays: null,
        },
        AT,
      ),
    });
    expect(f.ok).toBe(true);
    expect(f.warnings.join(' ')).toMatch(/more day/);
  });

  it('refuses on the reagent before warning about calibration', () => {
    // A refusal makes the warnings moot; reporting both would suggest the
    // run could proceed once calibration is sorted.
    const f = fitnessForTesting({
      equipment: ok,
      calibration: calibrationStatus(
        { calibratedAt: days(-100), intervalDays: 90 },
        AT,
      ),
      reagentLot: lot,
      reagentStatus: reagentLotStatus(
        { expiresOn: days(-1), openedOn: null, openStabilityDays: null },
        AT,
      ),
    });
    expect(f.ok).toBe(false);
  });

  it('passes when nothing is recorded at all', () => {
    // A laboratory that has not started recording equipment must not be
    // blocked from reporting results.
    expect(
      fitnessForTesting({
        equipment: null,
        calibration: null,
        reagentLot: null,
        reagentStatus: null,
      }),
    ).toEqual({ ok: true, warnings: [] });
  });
});
