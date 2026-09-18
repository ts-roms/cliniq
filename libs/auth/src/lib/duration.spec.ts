import { parseDurationMs } from './duration.js';

describe('parseDurationMs', () => {
  it('parses the jose-style shorthands the env uses', () => {
    expect(parseDurationMs('15m')).toBe(15 * 60_000);
    expect(parseDurationMs('7d')).toBe(7 * 86_400_000);
    expect(parseDurationMs('12h')).toBe(12 * 3_600_000);
    expect(parseDurationMs('90s')).toBe(90_000);
    expect(parseDurationMs('500ms')).toBe(500);
    expect(parseDurationMs('2w')).toBe(14 * 86_400_000);
    expect(parseDurationMs('3600')).toBe(3_600_000);
  });

  it('falls back to 7 days on garbage', () => {
    expect(parseDurationMs('soon')).toBe(7 * 86_400_000);
    expect(parseDurationMs('')).toBe(7 * 86_400_000);
  });
});
