import { Controller, Get, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@org/db';
import { Public } from '../auth/decorators/public.decorator.js';

/**
 * Required-vs-optional registry for env vars the lab module reads. Kept
 * here (vs. inside the readiness handler) so the catalog is grep-able
 * when adding new providers.
 *
 * `required`: feature breaks without it.
 * `optional`: feature degrades but doesn't break (e.g. mailer becomes
 *  no-op without RESEND_API_KEY; PayMongo links throw a friendly error).
 */
const LAB_ENV_VARS = {
  required: ['DATABASE_URL', 'AWS_REGION', 'S3_BUCKET_PHI', 'JWT_SECRET'],
  optional: [
    'WEB_URL',          // emails fall back to localhost in their links
    'RESEND_API_KEY',   // mailer becomes no-op
    'AI_SERVICE_URL',   // AI assist endpoints throw 502 when unset
    'PAYMONGO_SECRET_KEY',
    'PAYMONGO_WEBHOOK_SECRET',
  ],
} as const;

/**
 * Latest lab-related migration we expect to be applied. Bump this when
 * adding a new lab migration so the readiness probe surfaces drift
 * (Railway has historically gone out of sync after manual migrate-resolve
 * operations — better to fail readiness than to silently 500 in a route).
 */
const LATEST_LAB_MIGRATION = '20260507130000_lab_case_disputes';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async check() {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      checks: { db },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Pre-flight readiness for the lab module. Lists which env vars the
   * server can see (boolean only, never values) and whether the latest
   * lab migration has been applied. Public — knowing "PayMongo is
   * configured: yes/no" isn't a meaningful leak, and load balancers /
   * deploy hooks need to be able to read it without a JWT.
   */
  @Public()
  @Get('lab-readiness')
  async labReadiness() {
    const env = this.snapshotEnv();
    const migration = await this.checkLabMigration();
    const ok =
      env.required.missing.length === 0 && migration.applied;
    return {
      status: ok ? 'ready' : 'not-ready',
      env: {
        required: env.required,
        optional: env.optional,
      },
      migrations: migration,
      timestamp: new Date().toISOString(),
    };
  }

  private snapshotEnv() {
    const present = (k: string) =>
      typeof this.config.get<string>(k) === 'string' &&
      this.config.get<string>(k) !== '';
    const requiredMissing = LAB_ENV_VARS.required.filter((k) => !present(k));
    const optionalMissing = LAB_ENV_VARS.optional.filter((k) => !present(k));
    return {
      required: {
        configured: LAB_ENV_VARS.required.filter((k) => present(k)),
        missing: requiredMissing,
      },
      optional: {
        configured: LAB_ENV_VARS.optional.filter((k) => present(k)),
        missing: optionalMissing,
      },
    };
  }

  private async checkLabMigration() {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ migration_name: string; finished_at: Date | null }>
      >`
        SELECT migration_name, finished_at
          FROM "_prisma_migrations"
         WHERE migration_name = ${LATEST_LAB_MIGRATION}
         LIMIT 1
      `;
      const row = rows[0];
      return {
        latest: LATEST_LAB_MIGRATION,
        applied: !!row && row.finished_at !== null,
        finishedAt: row?.finished_at ? row.finished_at.toISOString() : null,
      };
    } catch (err) {
      this.logger.warn(
        `lab readiness migration check failed: ${(err as Error).message}`,
      );
      return {
        latest: LATEST_LAB_MIGRATION,
        applied: false,
        finishedAt: null,
        error: 'unable to read _prisma_migrations table',
      };
    }
  }
}
