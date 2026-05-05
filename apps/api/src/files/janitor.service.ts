import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '@org/db';

/**
 * Reaper for orphaned file uploads:
 *   - PENDING rows older than ORPHAN_MAX_AGE_MIN that never confirmed
 *   - DELETED rows older than RETAIN_DELETED_DAYS
 *
 * Implementation note: we use a plain setInterval rather than @nestjs/schedule
 * because the api uses webpack-node-externals + SWC and the schedule package's
 * internal module loading conflicts with that setup. setInterval is enough for
 * a 1/hour sweep — move to a real scheduler when we add multiple cron jobs.
 *
 * Disabled when JANITOR_ENABLED!=true so dev/test runs don't touch buckets.
 */
@Injectable()
export class FilesJanitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesJanitorService.name);
  private readonly s3: S3Client;
  private readonly bucketPhi: string;
  private readonly bucketPublic: string;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly orphanMaxAgeMin: number;
  private readonly retainDeletedDays: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1',
    });
    this.bucketPhi = this.config.get<string>('S3_BUCKET_PHI') ?? 'cliniq-phi-dev';
    this.bucketPublic = this.config.get<string>('S3_BUCKET_PUBLIC') ?? 'cliniq-public-dev';
    this.enabled = (this.config.get<string>('JANITOR_ENABLED') ?? 'false') === 'true';
    this.intervalMs = Number(this.config.get<string>('JANITOR_INTERVAL_MS') ?? 60 * 60 * 1000);
    this.orphanMaxAgeMin = Number(this.config.get<string>('ORPHAN_MAX_AGE_MIN') ?? 60);
    this.retainDeletedDays = Number(this.config.get<string>('RETAIN_DELETED_DAYS') ?? 90);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('files janitor disabled (set JANITOR_ENABLED=true to enable)');
      return;
    }
    this.timer = setInterval(() => {
      void this.sweep().catch((err) =>
        this.logger.error(`janitor sweep failed: ${(err as Error).message}`),
      );
    }, this.intervalMs);
    this.logger.log(`files janitor scheduled every ${this.intervalMs / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Manually-triggerable for tests. Returns counts. */
  async runOnce(): Promise<{ orphans: number; deleted: number }> {
    return {
      orphans: await this.reapOrphans(),
      deleted: await this.reapDeleted(),
    };
  }

  private async sweep(): Promise<void> {
    await Promise.all([this.reapOrphans(), this.reapDeleted()]);
  }

  private async reapOrphans(): Promise<number> {
    const cutoff = new Date(Date.now() - this.orphanMaxAgeMin * 60_000);
    // NOTE: janitor runs as the admin Prisma role (no withTenant) — reaping
    // is a system task that crosses tenant boundaries.
    const rows = await this.prisma.fileObject.findMany({
      where: { status: 'PENDING' as never, createdAt: { lt: cutoff } },
      select: { id: true, s3Key: true, isPhi: true, tenantId: true },
      take: 500,
    });
    let count = 0;
    for (const row of rows) {
      await this.tryDeleteFromS3(row.s3Key, row.isPhi);
      await this.prisma.fileObject.delete({ where: { id: row.id } });
      count++;
    }
    if (count > 0) this.logger.log(`reaped ${count} orphaned PENDING file(s)`);
    return count;
  }

  private async reapDeleted(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retainDeletedDays * 24 * 60 * 60_000);
    const rows = await this.prisma.fileObject.findMany({
      where: { status: 'DELETED' as never, deletedAt: { lt: cutoff } },
      select: { id: true, s3Key: true, isPhi: true },
      take: 500,
    });
    let count = 0;
    for (const row of rows) {
      await this.tryDeleteFromS3(row.s3Key, row.isPhi);
      await this.prisma.fileObject.delete({ where: { id: row.id } });
      count++;
    }
    if (count > 0) this.logger.log(`reaped ${count} long-deleted file(s)`);
    return count;
  }

  private async tryDeleteFromS3(s3Key: string, isPhi: boolean): Promise<void> {
    const bucket = isPhi ? this.bucketPhi : this.bucketPublic;
    try {
      // HEAD first so a 404 doesn't trip our metrics on already-orphaned keys.
      await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
    } catch (err) {
      this.logger.debug(`s3 delete skipped for ${s3Key}: ${(err as Error).message}`);
    }
  }
}
