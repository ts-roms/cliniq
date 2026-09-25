import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  enrolmentIsActive,
  evaluatePerformance,
  standardDeviationIndex,
  submissionState,
  summariseParticipation,
} from './eqap.js';
import type {
  RecordEqapResultDto,
  SubmitEqapRoundDto,
  UpsertEqapEnrolmentDto,
  UpsertEqapProviderDto,
} from './dto/eqap.dto.js';

/**
 * External quality assessment.
 *
 * The rules live in ./eqap.ts; this records who we are enrolled with, what
 * we submitted, what came back, and what we did about it.
 *
 * The evaluation is computed on read rather than stored, unlike QC. A QC run
 * is judged against a target that moves, so the verdict has to be frozen
 * with it; an EQAP result is judged against an SDI the provider supplies and
 * never revises. Nothing can drift underneath it.
 */
@Injectable()
export class EqapService {
  constructor(private readonly prisma: PrismaService) {}

  // ── providers ─────────────────────────────────────

  listProviders(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.eqapProvider.findMany({
        where: { deletedAt: null },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
    );
  }

  async upsertProvider(dto: UpsertEqapProviderDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.eqapProvider.findFirst({
        where: { name: dto.name, deletedAt: null },
      });
      const data = {
        name: dto.name,
        contactPerson: dto.contactPerson ?? null,
        email: dto.email ?? null,
        website: dto.website ?? null,
        isActive: dto.isActive ?? true,
      };
      return existing
        ? tx.eqapProvider.update({ where: { id: existing.id }, data })
        : tx.eqapProvider.create({
            data: { tenantId: user.tenantId, ...data },
          });
    });
  }

  // ── enrolments ────────────────────────────────────

  /** Enrolments with their participation record, which is what is asked for. */
  async listEnrolments(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rows = await tx.eqapEnrolment.findMany({
        where: { deletedAt: null },
        include: {
          provider: { select: { name: true } },
          submissions: true,
        },
        orderBy: { programme: 'asc' },
      });
      const now = new Date();
      return rows.map((e) => ({
        ...e,
        submissions: undefined,
        active: enrolmentIsActive(e, now),
        participation: summariseParticipation(e.submissions, now),
      }));
    });
  }

  async upsertEnrolment(dto: UpsertEqapEnrolmentDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      if (dto.validFrom && dto.validUntil && dto.validUntil < dto.validFrom) {
        throw new BadRequestException('validUntil is before validFrom');
      }
      const provider = await tx.eqapProvider.findFirst({
        where: { id: dto.providerId, deletedAt: null },
      });
      if (!provider) {
        throw new NotFoundException(
          `EQAP provider ${dto.providerId} not found`,
        );
      }
      const existing = await tx.eqapEnrolment.findFirst({
        where: {
          providerId: dto.providerId,
          programme: dto.programme,
          deletedAt: null,
        },
      });
      const data = {
        programme: dto.programme,
        enrolmentNumber: dto.enrolmentNumber ?? null,
        sectionId: dto.sectionId ?? null,
        validFrom: dto.validFrom ?? null,
        validUntil: dto.validUntil ?? null,
      };
      return existing
        ? tx.eqapEnrolment.update({ where: { id: existing.id }, data })
        : tx.eqapEnrolment.create({
            data: {
              tenantId: user.tenantId,
              providerId: dto.providerId,
              ...data,
            },
          });
    });
  }

  // ── survey rounds ─────────────────────────────────

  /** Record what we sent for a round. */
  async submitRound(dto: SubmitEqapRoundDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const enrolment = await tx.eqapEnrolment.findFirst({
        where: { id: dto.enrolmentId, deletedAt: null },
      });
      if (!enrolment) {
        throw new NotFoundException(`Enrolment ${dto.enrolmentId} not found`);
      }

      const existing = await tx.eqapSubmission.findFirst({
        where: {
          enrolmentId: dto.enrolmentId,
          roundRef: dto.roundRef,
          testId: dto.testId ?? null,
        },
      });
      const data = {
        dueOn: dto.dueOn ?? existing?.dueOn ?? null,
        submittedAt: dto.submittedAt ?? new Date(),
        submittedById: user.userId,
        reportedValue: dto.reportedValue ?? null,
      };
      return existing
        ? tx.eqapSubmission.update({ where: { id: existing.id }, data })
        : tx.eqapSubmission.create({
            data: {
              tenantId: user.tenantId,
              enrolmentId: dto.enrolmentId,
              roundRef: dto.roundRef,
              testId: dto.testId ?? null,
              ...data,
            },
          });
    });
  }

  /**
   * Record what the provider sent back.
   *
   * The SDI can be given directly or derived from the peer mean and SD. Both
   * are accepted because providers report differently, and recomputing one
   * from the other when only one is available would invent precision.
   */
  async recordResult(
    id: string,
    dto: RecordEqapResultDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const submission = await tx.eqapSubmission.findFirst({ where: { id } });
      if (!submission) {
        throw new NotFoundException(`EQAP submission ${id} not found`);
      }
      if (submission.submittedAt === null) {
        throw new BadRequestException(
          'this round has not been submitted; a provider scores what was sent to it',
        );
      }

      // Preserve the existing score when the caller is not supplying one.
      // This endpoint is also how corrective action is recorded, and an
      // earlier version recomputed `sdi` from the DTO alone — so documenting
      // a failure silently erased the provider's score, deleting the
      // evidence of the failure at exactly the moment someone acted on it.
      let sdi = dto.sdi ?? submission.sdi ?? null;
      if (dto.sdi == null && dto.peerMean != null && dto.peerSd != null) {
        const value = dto.reportedValue ?? submission.reportedValue;
        if (value === null) {
          throw new BadRequestException(
            'cannot derive an SDI without the value we reported',
          );
        }
        sdi = standardDeviationIndex(value, dto.peerMean, dto.peerSd);
      }

      const updated = await tx.eqapSubmission.update({
        where: { id },
        data: {
          reportedValue: dto.reportedValue ?? submission.reportedValue,
          peerMean: dto.peerMean ?? submission.peerMean,
          peerSd: dto.peerSd ?? submission.peerSd,
          sdi,
          reportFileId: dto.reportFileId ?? submission.reportFileId,
          correctiveAction: dto.correctiveAction ?? submission.correctiveAction,
        },
      });
      return {
        ...updated,
        performance: evaluatePerformance(updated.sdi),
        state: submissionState(updated, new Date()),
      };
    });
  }

  /** The rounds for an enrolment, each with its state and verdict. */
  async listSubmissions(enrolmentId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const enrolment = await tx.eqapEnrolment.findFirst({
        where: { id: enrolmentId, deletedAt: null },
      });
      if (!enrolment) {
        throw new NotFoundException(`Enrolment ${enrolmentId} not found`);
      }
      const rows = await tx.eqapSubmission.findMany({
        where: { enrolmentId },
        orderBy: [{ dueOn: 'desc' }, { roundRef: 'desc' }],
        take: 200,
      });
      const now = new Date();
      return rows.map((r) => ({
        ...r,
        state: submissionState(r, now),
        performance: evaluatePerformance(r.sdi),
      }));
    });
  }
}
