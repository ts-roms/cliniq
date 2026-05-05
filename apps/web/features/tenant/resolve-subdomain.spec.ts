import { describe, expect, it } from '@jest/globals';
import { resolveTenantSlug } from './resolve-subdomain';

describe('resolveTenantSlug', () => {
  const root = 'cliniq.app';

  it.each([
    ['acme.cliniq.app', 'acme'],
    ['ACME.cliniq.app', 'acme'],
    ['my-clinic-1.cliniq.app', 'my-clinic-1'],
    ['acme.cliniq.app:3000', 'acme'],
  ])('extracts %s -> %s', (host, expected) => {
    expect(resolveTenantSlug(host, root)).toBe(expected);
  });

  it.each([
    ['cliniq.app'],
    ['www.cliniq.app'],
    ['app.cliniq.app'],
    ['marketing.cliniq.app'],
    ['admin.cliniq.app'],
    ['localhost'],
    ['localhost:3000'],
    ['acme.example.com'],
    ['-leading.cliniq.app'],
    ['trailing-.cliniq.app'],
    ['under_score.cliniq.app'],
  ])('rejects %s', (host) => {
    expect(resolveTenantSlug(host, root)).toBeNull();
  });

  it('handles a different root domain', () => {
    expect(resolveTenantSlug('acme.example.test', 'example.test')).toBe('acme');
  });

  it('handles null input', () => {
    expect(resolveTenantSlug(null, root)).toBeNull();
  });
});
