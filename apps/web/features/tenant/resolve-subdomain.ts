// Pure tenant-slug resolver from a hostname. Used by the Edge middleware.
// No imports — keeps the middleware bundle tiny.

const RESERVED = new Set(['www', 'app', 'marketing', 'api', 'admin']);
const HOST_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function resolveTenantSlug(
  hostname: string | null,
  rootDomain: string,
): string | null {
  if (!hostname) return null;
  // strip port
  const host = hostname.split(':')[0].toLowerCase();
  if (host === 'localhost' || host === rootDomain) return null;
  const suffix = `.${rootDomain}`;
  if (!host.endsWith(suffix)) return null;
  const candidate = host.slice(0, -suffix.length);
  if (!candidate || RESERVED.has(candidate)) return null;
  if (!HOST_REGEX.test(candidate)) return null;
  return candidate;
}
