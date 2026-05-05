# `apps/api/src/` — feature-module layout

Mirrors the web app's `features/` layout. Each first-level folder is a NestJS
module that owns a single domain.

```
src/
├── app/                Root module + bootstrap controller/service
├── auth/               JWT, RBAC guards, decorators, login/register
├── tenants/            Tenant CRUD + bootstrap (owner user)
├── patients/           Patient CRUD with soft-delete + search
├── consultations/      Consult lifecycle + AI suggestion accept/edit/reject
├── prescriptions/      Rx CRUD + safety/ (rule-based interactions + allergy)
├── transcripts/        Audio → text boundary (forwards to ai-service)
├── files/              S3 presign + confirm
├── ai-client/          Internal HTTP client to ai-service (no controller)
├── audit/              Audit log persistence (decorator + global interceptor)
├── health/             /api/health for ALB + monitoring
├── common/             Cross-cutting: tenant-context middleware
└── main.ts             Bootstrap (helmet, CORS, ValidationPipe, Swagger)
```

## Mapping to `apps/web/features/`

| Domain | Web feature folder | API module folder |
|---|---|---|
| Auth + session | `features/auth/` | `auth/` |
| Tenants / clinic onboarding | `features/onboarding/` | `tenants/` |
| Patients | `features/patients/` | `patients/` |
| Consultations + AI scribe | `features/consultations/` | `consultations/` + `ai-client/` |
| Prescriptions + safety check | `features/prescriptions/` | `prescriptions/` (with `safety/`) |
| Tenant subdomain resolution | `features/tenant/` | `common/tenant-context.middleware.ts` |
| (cross-cutting) | `shared/components/` + `shared/hooks/` | `common/` + `audit/` |

Both sides keep one concern per folder, with co-located DTO/schema, hook/service,
and component/controller files. Renaming a feature is a single `mv` in either tree.

## Conventions per module

```
<feature>/
├── <feature>.controller.ts     HTTP layer (REST, DTOs, @Requires, @Audit)
├── <feature>.service.ts        Business logic — uses prisma.withTenant()
├── <feature>.module.ts         Module definition (providers + exports)
├── dto/                        class-validator + Swagger DTOs
└── (optional)                  guards/, decorators/, helpers/, safety/, …
```

- Controllers MUST be thin — DTO validation + delegate to the service.
- Services MUST use `prisma.withTenant(user.tenantId, user.userId, fn)` for
  every tenant-scoped query so RLS is honored even if a `WHERE` is missing.
- Inject only what the module owns. Cross-module collaboration goes through
  exported services (e.g. `AiClientModule` exports `AiClientService`,
  consumed by `ConsultationsModule.generateSoapDraft`).
- DTO files live under `dto/`.
- Mark every write / sensitive-read route with `@Audit({ action: '<area>.<verb>' })`
  — the global `AuditInterceptor` persists actor/entity/ip/ua to `audit_logs`.

## Adding a new feature module

```bash
mkdir -p apps/api/src/<feature>/dto
touch  apps/api/src/<feature>/{<feature>.controller,<feature>.service,<feature>.module}.ts

# Wire it into apps/api/src/app/app.module.ts imports[].
```

## Cross-cutting

- `common/tenant-context.middleware.ts` runs on every route via `AppModule.configure`
- Auth guards in `auth/guards/` are registered globally (`APP_GUARD`) — opt out per-route with `@Public()`
- `audit/audit.interceptor.ts` runs globally (`APP_INTERCEPTOR`) — opt-in per-route via `@Audit()`
- `PrismaService` from `@org/db` is exposed globally via `PrismaModule`
- `AiClientService` from `ai-client/` is exposed globally via `AiClientModule`
- `AuditService` from `audit/` is exposed globally via `AuditModule`
