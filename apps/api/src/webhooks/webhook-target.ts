import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * SSRF guard for the outbound webhook dispatcher.
 *
 * `tenant.settings.appointmentWebhookUrl` is written by any clinic ADMIN /
 * OWNER through `PATCH /tenants/me/settings`, so it is attacker-controlled
 * input as far as the api is concerned. Without this check a tenant could
 * point it at the cloud metadata service (169.254.169.254), at Postgres on
 * the private network, or at any other internal host, and read the status
 * code / timing back out of the api logs.
 *
 * The rules:
 *   - https only, unless WEBHOOKS_ALLOW_INSECURE=true (dev / docker-compose,
 *     where receivers are plain-http localhost stubs).
 *   - the hostname must resolve to a public unicast address. Every resolved
 *     address is checked, not just the first, so a host with one public and
 *     one private A record is still refused.
 *
 * DNS is resolved here and the caller connects by hostname, so a determined
 * attacker can still rebind between this check and the fetch. Closing that
 * needs a pinned-IP agent; this covers the realistic cases (metadata IPs,
 * `localhost`, RFC1918 names) at a fraction of the complexity.
 */
export type WebhookTargetVerdict =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export async function checkWebhookTarget(
  raw: string,
  opts: { allowInsecure?: boolean; allowPrivate?: boolean } = {},
): Promise<WebhookTargetVerdict> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a valid absolute URL' };
  }

  if (url.protocol !== 'https:') {
    if (!(opts.allowInsecure && url.protocol === 'http:')) {
      return { ok: false, reason: `scheme ${url.protocol} is not allowed` };
    }
  }

  // Credentials in the URL are never needed and leak into logs.
  if (url.username || url.password) {
    return { ok: false, reason: 'URL must not carry credentials' };
  }

  if (opts.allowPrivate) return { ok: true, url };

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      const resolved = await lookup(host, { all: true });
      addresses = resolved.map((r) => r.address);
    } catch (err) {
      return {
        ok: false,
        reason: `DNS lookup failed: ${(err as Error).message}`,
      };
    }
    if (addresses.length === 0) {
      return { ok: false, reason: 'host resolved to no addresses' };
    }
  }

  for (const address of addresses) {
    if (!isPublicUnicast(address)) {
      return {
        ok: false,
        reason: `host resolves to non-public address ${address}`,
      };
    }
  }

  return { ok: true, url };
}

/** True for addresses we are willing to send a tenant's webhook to. */
export function isPublicUnicast(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0) return false; // "this network"
  if (a === 10) return false; // RFC1918
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 192 && b === 0) return false; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT (RFC6598)
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

function isPublicIpv6(address: string): boolean {
  const addr = address.toLowerCase().split('%')[0];
  if (addr === '::' || addr === '::1') return false; // unspecified / loopback
  if (addr.startsWith('fe8') || addr.startsWith('fe9')) return false; // link-local
  if (addr.startsWith('fea') || addr.startsWith('feb')) return false; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return false; // unique-local
  if (addr.startsWith('ff')) return false; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) inherits the v4 rules.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return isPublicIpv4(mapped[1]);
  return true;
}
