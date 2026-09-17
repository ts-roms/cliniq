import { describe, expect, it } from '@jest/globals';
import { generateOpaqueToken, hashToken, secretsEqual } from './tokens';

describe('opaque tokens', () => {
  it('generates url-safe, high-entropy, unique tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    // 32 bytes → 43 base64url chars, no padding / reserved chars.
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically and never stores the token itself', () => {
    const t = generateOpaqueToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).not.toBe(hashToken(t + 'x'));
  });
});

describe('secretsEqual', () => {
  it('matches only identical non-empty secrets', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true);
    expect(secretsEqual('abc', 'abd')).toBe(false);
    expect(secretsEqual('abc', 'abcd')).toBe(false);
    expect(secretsEqual('', '')).toBe(false);
    expect(secretsEqual(undefined, 'abc')).toBe(false);
    expect(secretsEqual('abc', undefined)).toBe(false);
  });
});
