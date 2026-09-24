import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  AppointmentStatus,
  ConsultStatus,
  AiSuggestionStatus,
  AiSuggestionKind,
  type InputJsonValue,
} from '@org/db';
import {
  canTransition,
  transitionData,
} from '../appointments/appointment-transitions.js';
import type { StartConsultationDto } from './dto/start-consultation.dto.js';
import type { UpdateConsultationDto } from './dto/update-consultation.dto.js';
import type { AmendConsultationDto } from './dto/amend-consultation.dto.js';
import {
  AiSuggestionDecision,
  type DecideAiSuggestionDto,
} from './dto/submit-ai-suggestion.dto.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { AiClientService } from '../ai-client/ai-client.service.js';
import {
  AiBudgetService,
  estimateCostCentavos,
} from '../ai-budget/ai-budget.service.js';
import { FilesService } from '../files/files.service.js';
import { ConfigService } from '@nestjs/config';
import { IcdCodesService } from '../icd-codes/icd-codes.service.js';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClientService,
    private readonly budget: AiBudgetService,
    private readonly files: FilesService,
    private readonly config: ConfigService,
    private readonly icd: IcdCodesService,
  ) {}

  /**
   * Open a consult. With `appointmentId` the consult is bound to that booked
   * slot: the patient comes from the appointment (a mismatching patientId
   * is a 400), the appointment moves to IN_PROGRESS in the same transaction,
   * and completing the consult later completes the appointment. Without it,
   * this is a walk-in / ad-hoc consult and needs `patientId`.
   */
  async start(dto: StartConsultationDto, user: AuthenticatedUser) {
    if (!dto.patientId && !dto.appointmentId) {
      throw new BadRequestException('patientId or appointmentId is required');
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      let patientId = dto.patientId;
      let visitTypeId = dto.visitTypeId;

      if (dto.appointmentId) {
        const appt = await tx.appointment.findFirst({
          where: { id: dto.appointmentId, deletedAt: null },
          select: {
            id: true,
            patientId: true,
            status: true,
            visitTypeId: true,
            consultation: { select: { id: true } },
          },
        });
        if (!appt)
          throw new NotFoundException(
            `Appointment ${dto.appointmentId} not found`,
          );
        if (patientId && patientId !== appt.patientId) {
          throw new BadRequestException(
            'patientId does not match the appointment',
          );
        }
        if (appt.consultation) {
          throw new ConflictException({
            message: 'a consultation is already open for this appointment',
            consultationId: appt.consultation.id,
          });
        }
        if (!canTransition(appt.status, AppointmentStatus.IN_PROGRESS)) {
          throw new ConflictException(
            `cannot start a consult on a ${appt.status} appointment`,
          );
        }
        patientId = appt.patientId;
        // The booking already recorded what the patient is coming in for;
        // that answer wins over anything the caller passes at start time.
        visitTypeId = appt.visitTypeId ?? visitTypeId;
        await tx.appointment.update({
          where: { id: appt.id },
          data: transitionData(AppointmentStatus.IN_PROGRESS),
        });
      }

      const patient = await tx.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient)
        throw new NotFoundException(`Patient ${patientId} not found`);

      const consult = await tx.consultation.create({
        data: {
          tenantId: user.tenantId,
          patientId: patient.id,
          providerId: user.userId,
          appointmentId: dto.appointmentId ?? null,
          visitTypeId: visitTypeId ?? null,
          startedAt: new Date(),
          status: ConsultStatus.IN_PROGRESS,
        },
      });
      this.logger.log(
        `Consult ${consult.id} started for patient ${patient.id} by ${user.userId}` +
          (dto.appointmentId ? ` (appointment ${dto.appointmentId})` : ''),
      );
      return consult;
    });
  }

  async listForPatient(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.consultation.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { startedAt: 'desc' },
        take: 50,
      });
    });
  }

  async findById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const consult = await tx.consultation.findFirst({
        where: { id, deletedAt: null },
        include: {
          suggestions: { orderBy: { createdAt: 'desc' } },
          // Ascending: the chart renders the amendment trail in the order it
          // happened, and the last entry is the current content.
          amendments: { orderBy: { version: 'asc' } },
        },
      });
      if (!consult) throw new NotFoundException(`Consultation ${id} not found`);
      return consult;
    });
  }

  async update(
    id: string,
    dto: UpdateConsultationDto,
    user: AuthenticatedUser,
  ) {
    // Validate ICD-10 codes against the global catalog before save —
    // anything not in the catalog must be a typo or an unmapped code, both
    // worth blocking. Empty/undefined arrays skip the check.
    if (dto.diagnosisCodes && dto.diagnosisCodes.length > 0) {
      const unknown = await this.icd.findUnknown(dto.diagnosisCodes);
      if (unknown.length > 0) {
        throw new BadRequestException({
          message: `Unknown ICD-10 codes: ${unknown.join(', ')}`,
          unknownCodes: unknown,
        });
      }
    }
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.consultation.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true, lockedAt: true },
      });
      if (!existing)
        throw new NotFoundException(`Consultation ${id} not found`);
      if (existing.lockedAt) {
        throw new BadRequestException(
          `Consultation is locked. Correct it with POST /consultations/${id}/amendments (a reason is required).`,
        );
      }
      // SOAP sections are free-form JSON on the DTO; Prisma wants its
      // InputJsonValue for the Json columns.
      return tx.consultation.update({
        where: { id },
        data: {
          ...dto,
          subjective: dto.subjective as InputJsonValue | undefined,
          objective: dto.objective as InputJsonValue | undefined,
          assessment: dto.assessment as InputJsonValue | undefined,
          plan: dto.plan as InputJsonValue | undefined,
        },
      });
    });
  }

  async complete(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.consultation.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          status: true,
          appointmentId: true,
          appointment: { select: { status: true } },
          // The four SOAP fields too, so we can refuse to complete a totally
          // blank consultation — not clinical correctness, just "the doctor
          // documented something".
          subjective: true,
          objective: true,
          assessment: true,
          plan: true,
        },
      });
      if (!existing)
        throw new NotFoundException(`Consultation ${id} not found`);
      if (existing.status === ConsultStatus.COMPLETED) {
        throw new BadRequestException('Already completed');
      }
      // JSON columns: a Tiptap doc, a plain string, or null. "Blank" = null,
      // empty string, or an object/array with nothing in it.
      const isBlank = (v: unknown): boolean => {
        if (v == null) return true;
        if (typeof v === 'string') return v.trim() === '';
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === 'object') return Object.keys(v as object).length === 0;
        return false;
      };
      if (
        isBlank(existing.subjective) &&
        isBlank(existing.objective) &&
        isBlank(existing.assessment) &&
        isBlank(existing.plan)
      ) {
        throw new BadRequestException(
          'Cannot complete an empty consultation. Document at least one SOAP field first.',
        );
      }
      const now = new Date();
      // Close the booked slot too. If the appointment was cancelled or
      // otherwise moved under us, leave it — the consult record stands on
      // its own and a 409 here would block the doctor from signing off.
      if (
        existing.appointmentId &&
        existing.appointment &&
        canTransition(existing.appointment.status, AppointmentStatus.COMPLETED)
      ) {
        await tx.appointment.update({
          where: { id: existing.appointmentId },
          data: transitionData(AppointmentStatus.COMPLETED, now),
        });
      }
      return tx.consultation.update({
        where: { id },
        data: {
          status: ConsultStatus.COMPLETED,
          endedAt: now,
          lockedAt: now,
        },
      });
    });
  }

  /**
   * Amend a signed consultation.
   *
   * `complete` freezes the note (lockedAt) because it is a medico-legal
   * record and destructive editing is not acceptable. This is the lawful way
   * to correct one: the original row is never rewritten, and each amendment
   * is a complete snapshot of the note as amended, carrying forward whatever
   * the caller did not restate. The chart shows the latest version and the
   * trail that produced it.
   *
   * Only LOCKED consultations are amendable — an in-progress note is simply
   * edited through `update`, and sending those down two paths would leave two
   * different notions of "current".
   */
  async amend(id: string, dto: AmendConsultationDto, user: AuthenticatedUser) {
    if (dto.diagnosisCodes && dto.diagnosisCodes.length > 0) {
      const unknown = await this.icd.findUnknown(dto.diagnosisCodes);
      if (unknown.length > 0) {
        throw new BadRequestException({
          message: `Unknown ICD-10 codes: ${unknown.join(', ')}`,
          unknownCodes: unknown,
        });
      }
    }

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const consult = await tx.consultation.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          lockedAt: true,
          subjective: true,
          objective: true,
          assessment: true,
          plan: true,
          diagnosisCodes: true,
        },
      });
      if (!consult) throw new NotFoundException(`Consultation ${id} not found`);
      if (!consult.lockedAt) {
        throw new BadRequestException(
          'Consultation is not locked yet — edit it directly instead of amending',
        );
      }

      // Current content = latest amendment if there is one, else the note as
      // signed. Amendments stack, so correcting a correction works.
      const latest = await tx.consultationAmendment.findFirst({
        where: { consultationId: id },
        orderBy: { version: 'desc' },
      });
      const current = latest ?? consult;

      // Attribution is snapshotted, for the same reason Prescription snapshots
      // providerLicense: a later change to the user's name or licence must not
      // retroactively alter what was signed.
      const author = await tx.user.findFirst({
        where: { id: user.userId },
        select: { name: true, prcLicenseNumber: true },
      });

      const pick = <T>(next: T | undefined, prev: T): T =>
        next === undefined ? prev : next;

      return tx.consultationAmendment.create({
        data: {
          tenantId: user.tenantId,
          consultationId: id,
          // The unique index on (consultationId, version) is what actually
          // serialises concurrent amendments: if two clinicians race, one
          // insert fails rather than silently overwriting the other.
          version: (latest?.version ?? 0) + 1,
          authorId: user.userId,
          authorName: author?.name ?? null,
          authorLicense: author?.prcLicenseNumber ?? null,
          reason: dto.reason,
          subjective: pick(
            dto.subjective as InputJsonValue | undefined,
            current.subjective as InputJsonValue,
          ),
          objective: pick(
            dto.objective as InputJsonValue | undefined,
            current.objective as InputJsonValue,
          ),
          assessment: pick(
            dto.assessment as InputJsonValue | undefined,
            current.assessment as InputJsonValue,
          ),
          plan: pick(
            dto.plan as InputJsonValue | undefined,
            current.plan as InputJsonValue,
          ),
          diagnosisCodes: pick(dto.diagnosisCodes, current.diagnosisCodes),
        },
      });
    });
  }

  /** The amendment trail for a consultation, oldest first. */
  async listAmendments(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const consult = await tx.consultation.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!consult) throw new NotFoundException(`Consultation ${id} not found`);
      return tx.consultationAmendment.findMany({
        where: { consultationId: id },
        orderBy: { version: 'asc' },
      });
    });
  }

  // ── AI suggestion lifecycle ──────────────────────────────

  async listSuggestions(consultId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const consult = await tx.consultation.findFirst({
        where: { id: consultId, deletedAt: null },
        select: { id: true },
      });
      if (!consult)
        throw new NotFoundException(`Consultation ${consultId} not found`);
      return tx.aiSuggestion.findMany({
        where: { consultationId: consultId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  /**
   * Orchestrates SOAP-draft generation: loads patient context, calls
   * ai-service, persists the result as an AiSuggestion (PENDING) so the
   * doctor can accept/edit/reject in the UI.
   */
  async generateSoapDraft(
    consultId: string,
    transcript: string,
    user: AuthenticatedUser,
  ) {
    // Hard tenant cap — fails fast with 429 before we touch ai-service.
    // Patient AI_PROCESSING consent is enforced by ConsentsInterceptor at the
    // controller layer via @RequiresConsent(AI_PROCESSING, 'param:id-consultation').
    await this.budget.assertNotExceeded(user.tenantId);

    const context = await this.loadDraftContext(consultId, user);

    const aiResult = await this.ai.draftSoap({
      consultationId: context.consultId,
      transcript,
      patientContext: {
        age: context.ageYears,
        sex: context.sex,
        recentVisits: context.recentVisits,
        knownConditions: context.knownConditions,
        recentMedications: context.recentMedications,
      },
    });

    // Charge the tenant's monthly budget. Failure here is logged but never
    // breaks the user-visible flow — the suggestion is the value, the budget
    // counter is bookkeeping.
    void this.budget
      .record(
        user.tenantId,
        estimateCostCentavos({
          model: aiResult.model,
          inputTokens: aiResult.inputTokens,
          outputTokens: aiResult.outputTokens,
          cacheReadTokens: aiResult.cacheReadTokens,
        }),
      )
      .catch((err) =>
        this.logger.warn(`budget.record failed: ${(err as Error).message}`),
      );

    return this.createDraft(
      context.consultId,
      AiSuggestionKind.SOAP_DRAFT,
      aiResult.draft,
      { promptVersion: aiResult.promptVersion, model: aiResult.model },
      user,
    );
  }

  /**
   * Build the patient-context block sent to ai-service. Pulls:
   *   - demographics (age + sex)
   *   - the last 3 consults' brief summary (date + accepted assessment)
   *   - known conditions (deduped from past diagnosisCodes)
   *   - recent medications (deduped from past prescriptions, last 12 months)
   *
   * Stays inside the existing `withTenant` transaction so RLS holds.
   */
  private async loadDraftContext(consultId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const consult = await tx.consultation.findFirst({
        where: { id: consultId, deletedAt: null },
        select: { id: true, patientId: true },
      });
      if (!consult)
        throw new NotFoundException(`Consultation ${consultId} not found`);

      const patient = await tx.patient.findUnique({
        where: { id: consult.patientId },
        select: { id: true, dateOfBirth: true, sex: true },
      });
      if (!patient)
        throw new NotFoundException('Patient missing for this consultation');

      const recent = await tx.consultation.findMany({
        where: {
          patientId: consult.patientId,
          id: { not: consult.id },
          status: 'COMPLETED' as never,
          deletedAt: null,
        },
        select: {
          id: true,
          startedAt: true,
          assessment: true,
          diagnosisCodes: true,
        },
        orderBy: { startedAt: 'desc' },
        take: 3,
      });

      const recentRx = await tx.prescription.findMany({
        where: {
          patientId: consult.patientId,
          status: 'ISSUED' as never,
          deletedAt: null,
          issuedAt: { gte: monthsAgo(12) },
        },
        select: { items: { select: { drugName: true } } },
        orderBy: { issuedAt: 'desc' },
        take: 10,
      });

      const ageYears = Math.floor(
        (Date.now() - patient.dateOfBirth.getTime()) /
          (1000 * 60 * 60 * 24 * 365.25),
      );

      const knownConditions = dedupeStrings(
        recent.flatMap((c) => c.diagnosisCodes ?? []),
      );

      const recentMedications = dedupeStrings(
        recentRx.flatMap((rx) => rx.items.map((i) => i.drugName)),
      );

      const recentVisits = recent.map((c) => ({
        date: c.startedAt.toISOString().slice(0, 10),
        assessment: summarizeAssessment(c.assessment),
        icd10: c.diagnosisCodes ?? [],
      }));

      return {
        consultId: consult.id,
        patientId: consult.patientId,
        ageYears,
        sex: patient.sex,
        recentVisits,
        knownConditions,
        recentMedications,
      };
    });
  }

  /**
   * Dermatology AI draft. Uploads must already exist as confirmed FileObjects
   * (category=CONSULT_ATTACHMENT). Forwards image S3 keys to ai-service for
   * Bedrock Claude vision; persists the structured response as a PENDING
   * AiSuggestion (kind=DERM_DIFFERENTIAL). Doctor accepts/edits/rejects.
   */
  async generateDermDraft(
    consultId: string,
    fileIds: string[],
    presentingComplaint: string | undefined,
    user: AuthenticatedUser,
  ) {
    await this.budget.assertNotExceeded(user.tenantId);

    // Confirm + collect S3 keys; assertion via FilesService re-checks tenant ownership.
    const files = await Promise.all(
      fileIds.map((id) => this.files.confirm(id, user)),
    );
    if (files.some((f) => f.category !== 'CONSULT_ATTACHMENT')) {
      throw new BadRequestException(
        'All files must be category CONSULT_ATTACHMENT',
      );
    }
    const isPhi = files[0]?.isPhi ?? true;
    const bucket = isPhi
      ? (this.config.get<string>('S3_BUCKET_PHI') ?? 'cliniq-phi-dev')
      : (this.config.get<string>('S3_BUCKET_PUBLIC') ?? 'cliniq-public-dev');

    const context = await this.loadDraftContext(consultId, user);

    const aiResult = await this.ai.dermatologyDraft({
      consultationId: context.consultId,
      imageS3Keys: files.map((f) => f.s3Key),
      s3Bucket: bucket,
      patientContext: {
        age: context.ageYears,
        sex: context.sex,
        presentingComplaint,
      },
    });

    void this.budget
      .record(
        user.tenantId,
        estimateCostCentavos({
          model: aiResult.model,
          inputTokens: aiResult.inputTokens,
          outputTokens: aiResult.outputTokens,
          cacheReadTokens: aiResult.cacheReadTokens,
        }),
      )
      .catch((err) =>
        this.logger.warn(`budget.record failed: ${(err as Error).message}`),
      );

    return this.createDraft(
      context.consultId,
      AiSuggestionKind.DERM_DIFFERENTIAL,
      aiResult.draft,
      { promptVersion: aiResult.promptVersion, model: aiResult.model },
      user,
    );
  }

  /**
   * Lower-level helper: persist an already-generated draft as a PENDING
   * AiSuggestion. Exposed for tests + future kinds (DERM_DIFFERENTIAL etc).
   */
  async createDraft(
    consultId: string,
    kind: AiSuggestionKind,
    draft: Record<string, unknown>,
    meta: { promptVersion: string; model: string },
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const consult = await tx.consultation.findFirst({
        where: { id: consultId, deletedAt: null },
        select: { id: true },
      });
      if (!consult)
        throw new NotFoundException(`Consultation ${consultId} not found`);
      return tx.aiSuggestion.create({
        data: {
          tenantId: user.tenantId,
          consultationId: consult.id,
          kind,
          promptVersion: meta.promptVersion,
          model: meta.model,
          draftJson: draft as never,
        },
      });
    });
  }

  async decideSuggestion(
    consultId: string,
    suggestionId: string,
    dto: DecideAiSuggestionDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const suggestion = await tx.aiSuggestion.findFirst({
        where: { id: suggestionId, consultationId: consultId },
      });
      if (!suggestion)
        throw new NotFoundException(`Suggestion ${suggestionId} not found`);
      if (suggestion.status !== AiSuggestionStatus.PENDING) {
        throw new BadRequestException(
          `Suggestion already ${suggestion.status}`,
        );
      }

      const status =
        dto.decision === AiSuggestionDecision.ACCEPT
          ? AiSuggestionStatus.ACCEPTED
          : dto.decision === AiSuggestionDecision.EDIT_ACCEPT
            ? AiSuggestionStatus.EDITED_ACCEPTED
            : AiSuggestionStatus.REJECTED;

      const editDistance =
        dto.editedContent && dto.decision === AiSuggestionDecision.EDIT_ACCEPT
          ? estimateEditDistance(
              suggestion.draftJson as Record<string, unknown>,
              dto.editedContent,
            )
          : null;

      return tx.aiSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status,
          acceptedAt:
            status === AiSuggestionStatus.REJECTED ? null : new Date(),
          acceptedBy:
            status === AiSuggestionStatus.REJECTED ? null : user.userId,
          draftJson: (dto.decision === AiSuggestionDecision.EDIT_ACCEPT &&
          dto.editedContent
            ? dto.editedContent
            : suggestion.draftJson) as never,
          editDistance,
        },
      });
    });
  }
}

// Cheap edit-distance proxy: byte length delta of stringified JSON.
function estimateEditDistance(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): number {
  const b = before ? JSON.stringify(before) : '';
  const a = JSON.stringify(after);
  return Math.abs(a.length - b.length);
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

function dedupeStrings(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const s = v?.trim();
    if (s) out.add(s);
  }
  return [...out];
}

/**
 * Pulls the most useful prose out of a stored assessment JSON.
 * SOAP assessment is `[{ problem, icd10, reasoning }, …]`. We collapse to
 * a compact one-line-per-problem string so the prompt stays small and
 * prompt-cached.
 */
function summarizeAssessment(assessment: unknown): string {
  if (!Array.isArray(assessment)) {
    if (assessment && typeof assessment === 'object') {
      const a = assessment as Record<string, unknown>;
      if (typeof a.text === 'string') return a.text.slice(0, 200);
    }
    return '';
  }
  return assessment
    .map((entry) => {
      const e = entry as Record<string, unknown>;
      const problem = typeof e.problem === 'string' ? e.problem : '';
      const icd = typeof e.icd10 === 'string' ? ` (${e.icd10})` : '';
      return problem ? `${problem}${icd}` : '';
    })
    .filter(Boolean)
    .join('; ')
    .slice(0, 280);
}
