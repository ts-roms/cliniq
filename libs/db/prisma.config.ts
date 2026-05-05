// Prisma 7 reads CLI config from this file (the legacy `prisma` field in
// package.json is ignored). The DATABASE_URL we use for `prisma migrate` /
// `prisma db seed` lives in the workspace-root `.env`, so we load it from
// there explicitly — `dotenv` defaults to CWD which is `libs/db/` when
// prisma runs via `pnpm --dir libs/db exec prisma …`.
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Catalog seed only — global drugs + ICD-10. Tenant-scoped fixtures
    // (demo clinic, dev users, patients) live in tools/scripts/seed-dev.ts
    // and run via `pnpm db:seed` after this catalog seed.
    seed: "tsx prisma/seed/index.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
