# Running the E2E Test Suite

> Lives at [`apps/api-e2e/src/`](../../apps/api-e2e/src/). Six spec files
> exercise the api end-to-end as a real client would: the suite never
> touches the database directly, only the public HTTP surface.

## What's covered

| File | What it asserts |
|---|---|
| `tenant-isolation.spec.ts` | Cross-tenant RLS leaks — patients, queue tickets, OB pregnancies. Most important security regression test. |
| `feature-gates.spec.ts` | `@RequiresFeature` returns 402 when the tenant's plan doesn't include the flag. |
| `queue.spec.ts` | Issue ticket → call-next → close. Priority bumping. Empty-queue 404. |
| `ob.spec.ts` | Pregnancy creation with auto-EDD (Naegele). Auto-GA on visits. Block second active pregnancy. 2D ultrasound. |
| `lab.spec.ts` | End-to-end lab flow: invite → accept → submit case → transition through manufacturing → invoice → record payment. |
| `api/api.spec.ts` | Smoke: `/api/health` returns the expected shape. |

## Prerequisites

- Node 22 + pnpm 10 + `pnpm install` once.
- A running api on port 4000 — either the local one or a staging deploy.

## Running locally

```bash
# Terminal 1 — start the api
pnpm nx serve @org/api

# Terminal 2 — run the suite
pnpm nx run @org/api-e2e:e2e
```

The suite waits for `http://localhost:4000` to be reachable before it
starts. If port 4000 is closed it bails immediately with a clear hint
about starting the api.

## Running against a deployed environment

```bash
API_E2E_URL='https://api-cliniq.up.railway.app' \
  pnpm nx run @org/api-e2e:e2e
```

The suite creates ~10 throwaway `e2e-<timestamp>-<rand>` tenants per
run. They accumulate in the target DB — wipe periodically:

```sql
DELETE FROM tenants WHERE slug LIKE 'e2e-%';
```

Run the suite against **staging**, not prod, unless you really mean it.

## Filters

```bash
# Just the isolation tests
pnpm nx run @org/api-e2e:e2e --testPathPattern=tenant-isolation

# Just feature gates
pnpm nx run @org/api-e2e:e2e --testPathPattern=feature-gates
```

## Adding a new spec

1. Drop a `*.spec.ts` under `apps/api-e2e/src/`.
2. Use the harness:

```ts
import { bootEnv, type E2EEnv } from './support/harness';

let env: E2EEnv;
beforeAll(async () => { env = await bootEnv(); });
afterAll(async () => { await env?.cleanup(); });

it('does the thing', async () => {
  const { client } = await env.makeTenant({ plan: 'PRO' });
  const res = await client.axios.get('/api/your-route');
  expect(res.status).toBe(200);
});
```

`makeTenant` returns a fully signed-in client. `client.axios` already
has the bearer token + `validateStatus: () => true` (so 4xx don't
throw — assert status codes directly).

## When tests fail

### `Internal server error` on tenant create / login

The api is likely connected as `cliniq_app` (good) but a service is
missing `withPlatformContext` for a public route. Public auth routes
must bypass RLS; tenant-scoped routes must use `withTenant`. Grep for
`prisma.user.findUnique` / `prisma.tenant.create` calls outside both
helpers — those are bug candidates.

### `axios baseURL undefined` or all tests time out

`API_E2E_URL` doesn't have a scheme. Use `http://` or `https://` — the
URL parser bails silently otherwise and falls through to default
localhost:4000.

### Tests pass locally but fail on Railway

Most common: a migration hasn't been applied. Run:

```bash
DATABASE_URL='<railway-url>' \
  pnpm --dir libs/db exec prisma migrate status
```

## CI integration

For now the suite is a manual run. To add to CI:

1. Bring up Postgres (the existing `ci.yml` already does this for unit tests).
2. `pnpm --dir libs/db exec prisma migrate deploy` against the test DB.
3. `pnpm nx serve @org/api &` (or a docker-compose `api` service).
4. `pnpm nx run @org/api-e2e:e2e`.

Skip the suite on PRs that only touch docs or non-api code with an
`nx affected` filter.
