import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, QcOutcome, type PrismaClient } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { evaluateWestgard, zScore, type QcObservation } from './westgard.js';
import type {
  RecordQcRunDto,
  SetQcTargetDto,
  UpsertQcMaterialDto,
  CorrectiveActionDto,
} from './dto/qc.dto.js';

/** How far back the multirules look. 10x needs nine priors; take a margin. */
const HISTORY_DEPTH = 30;

/**
 * Internal quality control.
 *
 * A control material of known concentration is run alongside patient samples
 * and judged against an established mean and SD. The rules live in
 * ./westgard.ts; this records what was run, what was decided, and what was
 * done about it.
 *
 * The decision is stored, not recomputed. A run is judged against the target
 * in force at the time, and re-deriving it later — after a lot change or a
 * re-established mean — would silently rewrite history. The Levey-Jennings
 * chart an inspector asks for is a chart of what was decided then.
 */
@Injectable()
export class QcService {
  private readonly logger = new Logger(QcService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── materials ─────────────────────────────────────

  listMaterials(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.qcMaterial.findMany({
        where: { deletedAt: null },
        include: { targets: { orderBy: { effectiveFrom: 'desc' } } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { level: 'asc' }],
      }),
    );
  }

  /**
   * Record a control material, keyed by name AND lot.
   *
   * A new lot is a new material, not an edit: control material is made in
   * batches and the target mean shifts between them, so carrying the old
   * targets forward would judge new material against numbers that no longer
   * describe it.
   */
  async upsertMaterial(dto: UpsertQcMaterialDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.qcMaterial.findFirst({
        where: { name: dto.name, lotNumber: dto.lotNumber, deletedAt: null },
      });
      const data = {
        name: dto.name,
        level: dto.level,
        lotNumber: dto.lotNumber,
        manufacturer: dto.manufacturer ?? null,
        expiresOn: dto.expiresOn ?? null,
        isActive: dto.isActive ?? true,
      };
      return existing
        ? tx.qcMaterial.update({ where: { id: existing.id }, data })
        : tx.qcMaterial.create({ data: { tenantId: user.tenantId, ...data } });
    });
  }

  /**
   * Establish the target mean and SD for a material on one test.
   *
   * Supersedes rather than overwrites: the previous target is closed off at
   * now, so a run recorded last week stays judged against the numbers that
   * were in force last week.
   */
  async setTarget(dto: SetQcTargetDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      if (!(dto.sd > 0)) {
        throw new BadRequestException('target SD must be greater than zero');
      }
      const material = await tx.qcMaterial.findFirst({
        where: { id: dto.materialId, deletedAt: null },
      });
      if (!material) {
        throw new NotFoundException(`QC material ${dto.materialId} not found`);
      }

      const now = new Date();
      await tx.qcTarget.updateMany({
        where: {
          materialId: dto.materialId,
          testId: dto.testId,
          effectiveTo: null,
        },
        data: { effectiveTo: now },
      });
      return tx.qcTarget.create({
        data: {
          tenantId: user.tenantId,
          materialId: dto.materialId,
          testId: dto.testId,
          mean: dto.mean,
          sd: dto.sd,
          unit: dto.unit ?? null,
          effectiveFrom: now,
        },
      });
    });
  }

  // ── runs ──────────────────────────────────────────

  /**
   * Record a control result and evaluate it.
   *
   * `peers` are other levels of the same control run at the same time, which
   * is what R-4s compares against. The caller supplies them because only the
   * bench knows what was actually run together.
   */
  async recordRun(dto: RecordQcRunDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const material = await tx.qcMaterial.findFirst({
        where: { id: dto.materialId, deletedAt: null },
      });
      if (!material) {
        throw new NotFoundException(`QC material ${dto.materialId} not found`);
      }
      if (!material.isActive) {
        throw new BadRequestException(
          'this control material is not active; record a current lot instead',
        );
      }

      const runAt = dto.runAt ?? new Date();
      if (material.expiresOn && runAt > material.expiresOn) {
        throw new BadRequestException(
          `control lot ${material.lotNumber} expired on ${material.expiresOn.toISOString().slice(0, 10)}; a result from expired material shows nothing`,
        );
      }

      const target = await tx.qcTarget.findFirst({
        where: {
          materialId: dto.materialId,
          testId: dto.testId,
          effectiveFrom: { lte: runAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: runAt } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!target) {
        throw new BadRequestException(
          'no target mean and SD are established for this material and test; a control result cannot be judged without one',
        );
      }

      const z = zScore(dto.value, target.mean, target.sd);

      const priors = await tx.qcRun.findMany({
        where: {
          materialId: dto.materialId,
          testId: dto.testId,
          runAt: { lt: runAt },
        },
        orderBy: { runAt: 'desc' },
        take: HISTORY_DEPTH,
        select: { z: true },
      });
      // Oldest first — the rules read a series forwards.
      const history: QcObservation[] = priors
        .reverse()
        .map((p) => ({ z: p.z, level: material.level }));

      const peers: QcObservation[] = (dto.peerZScores ?? []).map((pz) => ({
        z: pz,
        // Any label other than this material's own, so peers never chain
        // into the same-level history rules. Only R-4s reads them.
        level: `${material.level}__peer`,
      }));

      const verdict = evaluateWestgard(
        { z, level: material.level },
        history,
        peers,
      );

      const run = await tx.qcRun.create({
        data: {
          tenantId: user.tenantId,
          materialId: dto.materialId,
          testId: dto.testId,
          value: dto.value,
          z,
          targetMean: target.mean,
          targetSd: target.sd,
          outcome: verdict.outcome as QcOutcome,
          violations: verdict.violations,
          runAt,
          performedById: user.userId,
        },
      });

      if (verdict.outcome === 'REJECTED') {
        this.logger.warn(
          `QC REJECTED: ${material.name} lot ${material.lotNumber} on test ${dto.testId} — ${verdict.violations.join(', ')} (z=${z.toFixed(2)})`,
        );
      }
      return { ...run, reason: verdict.reason };
    });
  }

  /** The Levey-Jennings series for one material and test, oldest first. */
  listRuns(
    user: AuthenticatedUser,
    opts: { testId?: string; materialId?: string; outcome?: QcOutcome } = {},
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.qcRun.findMany({
        where: {
          ...(opts.testId ? { testId: opts.testId } : {}),
          ...(opts.materialId ? { materialId: opts.materialId } : {}),
          ...(opts.outcome ? { outcome: opts.outcome } : {}),
        },
        include: {
          material: { select: { name: true, level: true, lotNumber: true } },
        },
        orderBy: { runAt: 'asc' },
        take: 500,
      }),
    );
  }

  /**
   * Record what was done about a rejected run.
   *
   * Only on a rejection: corrective action against a run that was in control
   * is noise, and it is the presence of action against real failures that an
   * inspection looks for.
   */
  async recordCorrectiveAction(
    id: string,
    dto: CorrectiveActionDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const run = await tx.qcRun.findFirst({ where: { id } });
      if (!run) throw new NotFoundException(`QC run ${id} not found`);
      if (run.outcome === QcOutcome.ACCEPTED) {
        throw new BadRequestException(
          'this run was in control; there is nothing to correct',
        );
      }
      return tx.qcRun.update({
        where: { id },
        data: { correctiveAction: dto.correctiveAction },
      });
    });
  }

  /**
   * Is this test currently in control?
   *
   * Reads the most recent run per material for the test. Returns null when
   * no QC has ever been recorded — a laboratory that has not started doing
   * QC is not the same as one whose QC failed, and conflating them would
   * make the indicator meaningless.
   */
  async statusForTest(tx: PrismaClient, testId: string) {
    const latest = await tx.qcRun.findMany({
      where: { testId },
      orderBy: { runAt: 'desc' },
      take: 10,
      include: { material: { select: { id: true, name: true } } },
    });
    if (latest.length === 0) return null;

    const seen = new Set<string>();
    const perMaterial = latest.filter((r) => {
      if (seen.has(r.materialId)) return false;
      seen.add(r.materialId);
      return true;
    });
    const rejected = perMaterial.filter(
      (r) => r.outcome === QcOutcome.REJECTED,
    );
    return {
      inControl: rejected.length === 0,
      rejected: rejected.map((r) => ({
        material: r.material.name,
        violations: r.violations,
        runAt: r.runAt,
        correctiveAction: r.correctiveAction,
      })),
    };
  }
}
