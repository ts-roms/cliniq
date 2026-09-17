import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import {
  ObPregnancyStatus,
  PrismaService,
  UltrasoundKind,
} from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type {
  CreateObVisitDto,
  CreatePregnancyDto,
  CreateUltrasoundDto,
  PresignUltrasoundFileDto,
  UpdatePregnancyDto,
} from './dto/ob.dto.js';

@Injectable()
export class ObService {
  private readonly logger = new Logger(ObService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly presignTtlSec = 600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'ap-southeast-1',
    });
    this.bucket = this.config.get<string>('S3_BUCKET_PHI') ?? 'cliniq-phi-dev';
  }

  // ── Pregnancies ──────────────────────────────────────────

  async listPregnancies(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.obPregnancy.findMany({
        where: { tenantId: user.tenantId, patientId, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          obVisits: { orderBy: { visitDate: 'desc' }, take: 5 },
          ultrasounds: { orderBy: { performedAt: 'desc' }, take: 5 },
        },
      }),
    );
  }

  async createPregnancy(dto: CreatePregnancyDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('patient not found');
      // Block second ACTIVE pregnancy for the same patient — flip the
      // existing one to a terminal state first if that's actually intended.
      const active = await tx.obPregnancy.findFirst({
        where: {
          tenantId: user.tenantId,
          patientId: patient.id,
          status: ObPregnancyStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (active) {
        throw new BadRequestException(
          `patient already has an active pregnancy (id=${active.id}); close it before starting a new one`,
        );
      }
      const lmp = dto.lmp ? new Date(dto.lmp) : null;
      const edd = dto.edd ? new Date(dto.edd) : eddFromLmp(lmp);
      return tx.obPregnancy.create({
        data: {
          tenantId: user.tenantId,
          patientId: patient.id,
          lmp,
          edd,
          eddSource: dto.eddSource ?? (lmp ? 'lmp' : null),
          gravida: dto.gravida ?? null,
          para: dto.para ?? null,
          bloodType: dto.bloodType ?? null,
        },
      });
    });
  }

  async updatePregnancy(id: string, dto: UpdatePregnancyDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.obPregnancy.findFirst({
        where: { id, tenantId: user.tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('pregnancy not found');
      // If LMP changed and EDD wasn't explicitly set, recompute EDD via Naegele.
      const newLmp = dto.lmp === undefined ? existing.lmp : dto.lmp ? new Date(dto.lmp) : null;
      const newEdd =
        dto.edd === undefined
          ? existing.edd
          : dto.edd
            ? new Date(dto.edd)
            : null;
      const finalEdd =
        dto.edd === undefined && dto.lmp !== undefined
          ? eddFromLmp(newLmp)
          : newEdd;
      return tx.obPregnancy.update({
        where: { id },
        data: {
          status: dto.status ?? existing.status,
          lmp: newLmp,
          edd: finalEdd,
          eddSource: dto.eddSource ?? existing.eddSource,
          gravida: dto.gravida ?? existing.gravida,
          para: dto.para ?? existing.para,
          notes: dto.notes ?? existing.notes,
          outcomeAt:
            dto.status &&
            dto.status !== existing.status &&
            dto.status !== ObPregnancyStatus.ACTIVE
              ? new Date()
              : existing.outcomeAt,
        },
      });
    });
  }

  // ── OB visits ────────────────────────────────────────────

  async createVisit(dto: CreateObVisitDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const preg = await tx.obPregnancy.findFirst({
        where: { id: dto.pregnancyId, tenantId: user.tenantId, deletedAt: null },
      });
      if (!preg) throw new NotFoundException('pregnancy not found');
      const visitDate = dto.visitDate ? new Date(dto.visitDate) : new Date();
      // Auto-fill GA from EDD if the user didn't pass it explicitly.
      const auto = preg.edd ? gaFromEdd(visitDate, preg.edd) : null;
      const gaWeeks = dto.gaWeeks ?? auto?.weeks ?? null;
      const gaDays = dto.gaDays ?? auto?.days ?? null;
      return tx.obVisit.create({
        data: {
          tenantId: user.tenantId,
          pregnancyId: preg.id,
          visitDate,
          gaWeeks,
          gaDays,
          fundalHeightCm: dto.fundalHeightCm ?? null,
          fetalHeartRate: dto.fetalHeartRate ?? null,
          presentation: dto.presentation ?? null,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  // ── Ultrasound ───────────────────────────────────────────

  async createUltrasound(dto: CreateUltrasoundDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('patient not found');
      if (dto.pregnancyId) {
        const preg = await tx.obPregnancy.findFirst({
          where: { id: dto.pregnancyId, tenantId: user.tenantId, deletedAt: null },
          select: { id: true, patientId: true },
        });
        if (!preg) throw new NotFoundException('pregnancy not found');
        if (preg.patientId !== patient.id) {
          throw new BadRequestException('pregnancy belongs to a different patient');
        }
      }
      return tx.ultrasoundReport.create({
        data: {
          tenantId: user.tenantId,
          patientId: patient.id,
          pregnancyId: dto.pregnancyId ?? null,
          performedByUserId: user.userId,
          performedAt: dto.performedAt ? new Date(dto.performedAt) : new Date(),
          kind: dto.kind,
          indication: dto.indication ?? null,
          bpdMm: dto.bpdMm ?? null,
          hcMm: dto.hcMm ?? null,
          acMm: dto.acMm ?? null,
          flMm: dto.flMm ?? null,
          estimatedFetalWeightG: dto.estimatedFetalWeightG ?? null,
          amnioticFluidIndexCm: dto.amnioticFluidIndexCm ?? null,
          fetalHeartRate: dto.fetalHeartRate ?? null,
          presentation: dto.presentation ?? null,
          placentaLocation: dto.placentaLocation ?? null,
          fetalSex: dto.fetalSex ?? null,
          findings: dto.findings ?? null,
          impression: dto.impression ?? null,
        },
        include: { files: true },
      });
    });
  }

  async listUltrasounds(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.ultrasoundReport.findMany({
        where: { tenantId: user.tenantId, patientId, deletedAt: null },
        orderBy: [{ performedAt: 'desc' }],
        include: { files: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
      }),
    );
  }

  async findUltrasoundById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const report = await tx.ultrasoundReport.findFirst({
        where: { id, tenantId: user.tenantId, deletedAt: null },
        include: { files: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
      });
      if (!report) throw new NotFoundException('report not found');
      return report;
    });
  }

  /** Presign a PUT URL for an ultrasound image attachment. */
  async presignFile(
    reportId: string,
    dto: PresignUltrasoundFileDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const report = await tx.ultrasoundReport.findFirst({
        where: { id: reportId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!report) throw new NotFoundException('report not found');
      const ext = sanitizeExt(dto.filename);
      const key = `ultrasound/${user.tenantId}/${report.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;

      const max = await tx.ultrasoundFile.aggregate({
        where: { reportId: report.id },
        _max: { sortOrder: true },
      });
      const sortOrder = (max._max.sortOrder ?? -1) + 1;

      const fileRow = await tx.ultrasoundFile.create({
        data: {
          reportId: report.id,
          s3Key: key,
          filename: dto.filename,
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          caption: dto.caption ?? null,
          sortOrder,
          uploadedByUserId: user.userId,
        },
      });

      const uploadUrl = await getSignedUrl(
        this.s3,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: dto.mimeType,
          ContentLength: dto.sizeBytes,
          ServerSideEncryption: 'aws:kms',
        }),
        { expiresIn: this.presignTtlSec },
      );

      return {
        fileId: fileRow.id,
        s3Key: key,
        uploadUrl,
        expiresInSec: this.presignTtlSec,
        headers: {
          'content-type': dto.mimeType,
          'x-amz-server-side-encryption': 'aws:kms',
        },
      };
    });
  }

  async deleteUltrasoundFile(reportId: string, fileId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const file = await tx.ultrasoundFile.findFirst({
        where: { id: fileId, reportId, deletedAt: null },
      });
      if (!file) throw new NotFoundException('file not found');
      await tx.ultrasoundFile.update({
        where: { id: fileId },
        data: { deletedAt: new Date() },
      });
    });
  }
}

/**
 * Naegele's rule for EDD: LMP + 280 days. Returns null when LMP is null.
 * Day-of-week handling stays in JS — EDD is a pure date so we'd lose
 * nothing by truncating, but we keep the time at 00:00 UTC for symmetry
 * with the @db.Date column.
 */
function eddFromLmp(lmp: Date | null): Date | null {
  if (!lmp) return null;
  const d = new Date(lmp);
  d.setUTCDate(d.getUTCDate() + 280);
  return d;
}

/**
 * Gestational age at `visitDate`, derived from EDD via the inverse of
 * Naegele's rule (visitDate is at GA = 40w − (EDD - visitDate)/7d).
 * Returns weeks + remainder days, both >= 0.
 */
function gaFromEdd(visitDate: Date, edd: Date): { weeks: number; days: number } {
  const conception = new Date(edd);
  conception.setUTCDate(conception.getUTCDate() - 280);
  const ms = visitDate.getTime() - conception.getTime();
  const totalDays = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  return { weeks: Math.floor(totalDays / 7), days: totalDays % 7 };
}

function sanitizeExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  const ext = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}
