import {
  REDACTED,
  TRUNCATED,
  diffFields,
  isSensitiveField,
  readReason,
} from './changes.js';

describe('which fields count as changed', () => {
  it('reports only what actually differs', () => {
    expect(
      diffFields(
        { firstName: 'Ana', lastName: 'Cruz' },
        { firstName: 'Anna', lastName: 'Cruz' },
      ),
    ).toEqual([{ field: 'firstName', before: 'Ana', after: 'Anna' }]);
  });

  it('is driven by what the request sent, not by every column', () => {
    // `after` is a validated DTO. A request that sends firstName alone is not
    // an assertion that every other column should read as cleared.
    const before = { firstName: 'Ana', lastName: 'Cruz', mrn: 'MRN-1' };
    expect(diffFields(before, { firstName: 'Anna' })).toEqual([
      { field: 'firstName', before: 'Ana', after: 'Anna' },
    ]);
  });

  it('ignores a key that is present but undefined', () => {
    // Prisma omits an undefined field rather than nulling it, so reporting it
    // as a change to null would be a lie about what happened.
    expect(diffFields({ firstName: 'Ana' }, { firstName: undefined })).toEqual(
      [],
    );
  });

  it('does report an explicit null, which is a real change', () => {
    expect(diffFields({ comment: 'watch' }, { comment: null })).toEqual([
      { field: 'comment', before: 'watch', after: null },
    ]);
  });

  it('treats undefined and null as the same prior value', () => {
    // A column that was never set and one explicitly null are the same thing
    // to a reader of the trail, and reporting the difference is noise.
    expect(diffFields({}, { comment: null })).toEqual([]);
    expect(diffFields({ comment: undefined }, { comment: null })).toEqual([]);
  });

  it('records a newly-set field', () => {
    expect(diffFields({}, { comment: 'watch' })).toEqual([
      { field: 'comment', before: null, after: 'watch' },
    ]);
  });

  it('survives a null or missing before', () => {
    expect(diffFields(null, { a: 1 })).toEqual([
      { field: 'a', before: null, after: 1 },
    ]);
    expect(diffFields(undefined, { a: 1 })).toHaveLength(1);
  });

  it('returns nothing when there is no after', () => {
    expect(diffFields({ a: 1 }, null)).toEqual([]);
    expect(diffFields({ a: 1 }, undefined)).toEqual([]);
  });
});

describe('dates, the reason normalisation exists', () => {
  it('does not report an unchanged date as changed', () => {
    // Two Date objects for the same instant are never ===, and Prisma hands
    // back a Date where a DTO carries an ISO string. Without this, every
    // update would report dateOfBirth as changed, and a trail that cries wolf
    // on every row is worse than one that says nothing.
    const d = new Date('1985-03-02T00:00:00.000Z');
    expect(
      diffFields({ dateOfBirth: d }, { dateOfBirth: new Date(+d) }),
    ).toEqual([]);
  });

  it('matches a Date against the equivalent ISO string', () => {
    expect(
      diffFields(
        { dateOfBirth: new Date('1985-03-02T00:00:00.000Z') },
        { dateOfBirth: '1985-03-02T00:00:00.000Z' },
      ),
    ).toEqual([]);
  });

  it('still catches a genuine date change, stored as ISO', () => {
    const [c] = diffFields(
      { dateOfBirth: new Date('1985-03-02T00:00:00.000Z') },
      { dateOfBirth: new Date('1985-03-03T00:00:00.000Z') },
    );
    expect(c).toEqual({
      field: 'dateOfBirth',
      before: '1985-03-02T00:00:00.000Z',
      after: '1985-03-03T00:00:00.000Z',
    });
  });
});

describe('nested values', () => {
  it('does not report an equal object as changed', () => {
    expect(diffFields({ settings: { a: 1 } }, { settings: { a: 1 } })).toEqual(
      [],
    );
  });

  it('reports an object that really changed', () => {
    const [c] = diffFields({ settings: { a: 1 } }, { settings: { a: 2 } });
    expect(c.field).toBe('settings');
    expect(c.after).toEqual({ a: 2 });
  });

  it('does not throw or run away on a cyclic value', () => {
    // A failed diff must never fail the request it is describing. The depth
    // cap in the redaction walk is what bounds this — it stops before the
    // cycle can recur, so the value is finite rather than either thrown away
    // or serialised forever. The invariants that matter are that nothing
    // throws and that what gets stored is small.
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => diffFields({ x: 1 }, { x: cyclic })).not.toThrow();
    const [c] = diffFields({ x: 1 }, { x: cyclic });
    expect(JSON.stringify(c.after).length).toBeLessThan(200);
    expect(JSON.stringify(c.after)).toContain(TRUNCATED);
  });
});

describe('redaction', () => {
  it('matches the obvious names', () => {
    for (const f of [
      'password',
      'passwordHash',
      'newPassword',
      'password_confirmation',
      'mfaSecret',
      'totpSecret',
      'refreshToken',
      'apiKey',
      'api_key',
      'cardNumber',
      'cvv',
      'signature',
    ]) {
      expect(isSensitiveField(f)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isSensitiveField('PASSWORD')).toBe(true);
    expect(isSensitiveField('MfaSecret')).toBe(true);
  });

  it('leaves ordinary clinical fields alone', () => {
    for (const f of ['firstName', 'dateOfBirth', 'resultValue', 'comment']) {
      expect(isSensitiveField(f)).toBe(false);
    }
  });

  it('records that a secret changed without recording the secret', () => {
    // This is the whole balance: "the password changed" is exactly what the
    // trail should say; the value is what it must not say.
    expect(
      diffFields({ passwordHash: 'old-hash' }, { passwordHash: 'new-hash' }),
    ).toEqual([{ field: 'passwordHash', before: REDACTED, after: REDACTED }]);
  });

  it('never lets a secret value through in either direction', () => {
    const out = diffFields(
      { mfaSecret: 'JBSWY3DPEHPK3PXP' },
      { mfaSecret: 'NEWSECRET1234567' },
    );
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialised).not.toContain('NEWSECRET1234567');
  });

  it('redacts a sensitive key nested inside a stored object', () => {
    // Tenant settings carry a free-form `extras` blob, diffed at the top
    // level — so the field name is "extras" and the value is the whole
    // object. Checking only the top-level name would write anything a tenant
    // chose to keep in there, verbatim, into a table that cannot be edited.
    const out = diffFields(
      {},
      { extras: { note: 'ok', apiKey: 'sk_live_X1' } },
    );
    expect(JSON.stringify(out)).not.toContain('sk_live_X1');
    // The shape survives; only the secret is replaced.
    expect(out[0].after).toEqual({ note: 'ok', apiKey: REDACTED });
  });

  it('redacts a sensitive key at any depth', () => {
    const out = diffFields({}, { a: { b: { c: { password: 'hunter2' } } } });
    expect(JSON.stringify(out)).not.toContain('hunter2');
  });

  it('redacts inside an array of objects', () => {
    const out = diffFields({}, { list: [{ token: 'tok_abc' }, { ok: 1 }] });
    expect(JSON.stringify(out)).not.toContain('tok_abc');
  });

  it('redacts even when the value is an object', () => {
    const out = diffFields({}, { credentials: { user: 'a', pass: 'b' } });
    expect(JSON.stringify(out)).not.toContain('"pass"');
  });
});

describe('size limits, because the table is append-only', () => {
  it('truncates a long string but keeps the field', () => {
    const long = 'x'.repeat(5000);
    const [c] = diffFields({ note: 'short' }, { note: long });
    expect(c.field).toBe('note');
    expect(String(c.after)).toContain(TRUNCATED);
    expect(String(c.after).length).toBeLessThan(700);
  });

  it('caps the number of fields recorded', () => {
    const after: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) after[`f${i}`] = i;
    expect(diffFields({}, after).length).toBeLessThanOrEqual(50);
  });

  it('replaces an oversized object rather than storing it', () => {
    const big = { blob: 'y'.repeat(5000) };
    expect(diffFields({}, { payload: big })[0].after).toBe(TRUNCATED);
  });
});

describe('the stated reason', () => {
  it('lifts a reason off the request body', () => {
    expect(readReason({ reason: 'Transcription error' })).toBe(
      'Transcription error',
    );
  });

  it('trims it', () => {
    expect(readReason({ reason: '  spaced  ' })).toBe('spaced');
  });

  it('treats a blank reason as none', () => {
    expect(readReason({ reason: '   ' })).toBeNull();
    expect(readReason({ reason: '' })).toBeNull();
  });

  it('ignores a non-string or absent reason', () => {
    expect(readReason({ reason: 42 })).toBeNull();
    expect(readReason({})).toBeNull();
    expect(readReason(null)).toBeNull();
    expect(readReason('reason')).toBeNull();
    expect(readReason([{ reason: 'x' }])).toBeNull();
  });

  it('caps a very long reason', () => {
    const r = readReason({ reason: 'z'.repeat(5000) });
    expect(r).toHaveLength(1000);
  });
});
