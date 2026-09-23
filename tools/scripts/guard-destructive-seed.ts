/**
 * Refuse to run a destructive seed against anything that is not a local
 * development database.
 *
 * `seed-dev.ts` and `seed-demo-lab.ts` both start by DELETING their tenants
 * (`prisma.tenant.delete`), which cascades away every user, patient,
 * consultation, appointment and lab case under them, then recreate the users
 * with whatever DEMO_PASSWORD is in the environment — invalidating any
 * credentials already handed out.
 *
 * The realistic accident is not running these inside a deployed container. It
 * is running them from a laptop with DATABASE_URL pointed at a managed
 * database through a TCP proxy, which is exactly how migrations are applied
 * (see docs/railway.md). In that situation none of the RAILWAY_* variables
 * are set, so an env-only check would wave it straight through. The host in
 * DATABASE_URL is therefore the primary signal.
 *
 * Escape hatch, for a deliberate first-time seed of a fresh environment:
 *
 *   SEED_ALLOW_REMOTE_HOST=hayabusa.proxy.rlwy.net pnpm db:seed
 *
 * It has to name the exact host, so a stale `export` left in a shell cannot
 * silently authorise a different database later.
 */

/** Hosts we are confident are a developer's own machine or compose network. */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  // docker-compose service names (docker-compose.yml + CI)
  'postgres',
  'db',
  'cliniq-postgres',
  'host.docker.internal',
]);

function hostOf(url: string): string | null {
  try {
    // The postgres:// scheme parses fine with WHATWG URL.
    return new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}

function refuse(reason: string, host: string | null): never {
  const lines: Array<string | null> = [
    '',
    '  REFUSING TO RUN — this seed is destructive.',
    '',
    `  ${reason}`,
    host ? `  DATABASE_URL host: ${host}` : null,
    '',
    '  It deletes its tenants and everything cascading from them (users,',
    '  patients, consultations, appointments, lab cases), then recreates the',
    '  accounts with the current DEMO_PASSWORD — which invalidates any',
    '  credentials already in use.',
    '',
    '  If this really is a fresh environment you mean to seed, name the host:',
    `    SEED_ALLOW_REMOTE_HOST=${host ?? '<host>'} <your command>`,
    '',
    '  To add rows to an existing deployed tenant, write an insert-only',
    '  script instead — do not reach for this one.',
    '',
  ];
  console.error(lines.filter((l) => l !== '').join('\n'));
  process.exit(1);
}

/**
 * Call at the top of any seed that deletes data. Exits the process rather
 * than throwing, so a caller cannot accidentally swallow it in a try/catch.
 */
export function assertLocalDatabase(scriptName: string): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`\n  ${scriptName}: DATABASE_URL is not set.\n`);
    process.exit(1);
  }

  const host = hostOf(url);
  const allowed = process.env.SEED_ALLOW_REMOTE_HOST?.trim().toLowerCase();

  if (allowed && host && allowed === host) {
    console.warn(
      `\n  ⚠ ${scriptName}: SEED_ALLOW_REMOTE_HOST matches ${host} — ` +
        `running a DESTRUCTIVE seed against a non-local database.\n`,
    );
    return;
  }

  if (host === null) {
    refuse(
      'DATABASE_URL could not be parsed, so the host cannot be checked.',
      null,
    );
  }

  // A deployed container: belt and braces on top of the host check, since
  // inside Railway the host is a private domain rather than localhost.
  const railwayEnv =
    process.env.RAILWAY_ENVIRONMENT_NAME ??
    process.env.RAILWAY_ENVIRONMENT ??
    process.env.RAILWAY_PROJECT_ID;
  if (railwayEnv) {
    refuse(`Running inside Railway (${railwayEnv}).`, host);
  }

  if (process.env.NODE_ENV === 'production') {
    refuse('NODE_ENV=production.', host);
  }

  if (!LOCAL_HOSTS.has(host)) {
    refuse(`"${host}" is not a known local database host.`, host);
  }
}
