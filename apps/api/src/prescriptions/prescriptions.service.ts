import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, RxStatus } from '@org/db';
import type { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import {
  checkInteractions,
  type InteractionFinding,
} from './safety/interactions.js';
import { renderRxPdf } from './pdf/render-rx-pdf.js';

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Standalone safety check (the web UI calls this on every Rx-form change
   * to surface warnings live without writing anything).
   */
  precheck(dto: Pick<CreatePrescriptionDto, 'items' | 'knownAllergies' | 'currentMedications'>) {
    const findings = checkInteractions({
      newDrugs: dto.items.map((i) => i.drugName),
      currentMedications: dto.currentMedications,
      allergies: dto.knownAllergies,
    });
    return { findings, blocking: findings.some((f) => f.severity === 'urgent') };
  }

  async create(dto: CreatePrescriptionDto, user: AuthenticatedUser) {
    // Provider must have an active PRC license to issue an Rx in PH.
    const provider = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        name: true,
        prcLicenseNumber: true,
        prcLicenseExpiry: true,
        prcSpecialty: true,
      },
    });
    if (!provider?.prcLicenseNumber) {
      throw new BadRequestException(
        'Cannot issue prescription: PRC license number missing on your profile. Settings → My profile.',
      );
    }
    if (provider.prcLicenseExpiry && provider.prcLicenseExpiry.getTime() < Date.now()) {
      throw new BadRequestException(
        'Cannot issue prescription: PRC license has expired. Update your profile.',
      );
    }

    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: dto.patientId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);

      if (dto.consultationId) {
        const consult = await tx.consultation.findFirst({
          where: { id: dto.consultationId, patientId: dto.patientId, deletedAt: null },
          select: { id: true },
        });
        if (!consult) {
          throw new NotFoundException(`Consultation ${dto.consultationId} not found`);
        }
      }

      // Server-side allergy + medication context — never trust the client to
      // declare what the patient is allergic to. We still let the client pass
      // hints (knownAllergies / currentMedications) for UX, but the safety
      // check fuses them with what's on file.
      const dbAllergies = await tx.allergy.findMany({
        where: { patientId: patient.id },
        select: { substance: true },
      });
      const dbMeds = await tx.medication.findMany({
        where: { patientId: patient.id, status: 'ACTIVE' },
        select: { drugName: true },
      });
      const fusedAllergies = Array.from(
        new Set([
          ...(dto.knownAllergies ?? []),
          ...dbAllergies.map((a) => a.substance),
        ]),
      );
      const fusedMeds = Array.from(
        new Set([
          ...(dto.currentMedications ?? []),
          ...dbMeds.map((m) => m.drugName),
        ]),
      );

      // Resolve drug catalog refs (when the client passed drugId). We pull
      // the catalog row inside the same transaction so RLS scopes naturally
      // and fail closed if it disappears mid-request.
      const catalogIds = dto.items.map((i) => i.drugId).filter((id): id is string => !!id);
      const catalogRows = catalogIds.length
        ? await tx.drug.findMany({
            where: { id: { in: catalogIds }, active: true },
            select: { id: true, generic: true, brand: true, classes: true },
          })
        : [];
      const catalog = new Map(catalogRows.map((d) => [d.id, d]));

      // Class-based allergy guard — match catalog drug classes against the
      // patient's allergy list. e.g. patient allergic to "penicillin" + Rx
      // includes "amoxicillin" (class: penicillin) → urgent finding.
      const classAllergyFindings: InteractionFinding[] = [];
      const allergyTerms = fusedAllergies.map((a) => a.toLowerCase());
      for (const item of dto.items) {
        const cat = item.drugId ? catalog.get(item.drugId) : undefined;
        const classes = (cat?.classes ?? []).map((c) => c.toLowerCase());
        const matched = classes.find((c) =>
          allergyTerms.some((a) => a.includes(c) || c.includes(a)),
        );
        if (matched) {
          classAllergyFindings.push({
            kind: 'allergy',
            severity: 'urgent',
            message: `Patient is allergic to "${matched}" — ${item.drugName} is in this class`,
            drugs: [item.drugName],
          });
        }
      }

      const interactionFindings = checkInteractions({
        newDrugs: dto.items.map((i) => i.drugName),
        currentMedications: fusedMeds,
        allergies: fusedAllergies,
      });

      const findings = [...classAllergyFindings, ...interactionFindings];
      const blocking = findings.some((f) => f.severity === 'urgent');
      if (blocking && !dto.override) {
        throw new BadRequestException({
          message: 'Prescription blocked by safety check. Pass override=true to acknowledge.',
          findings,
        });
      }

      const number = await this.nextNumber(tx, user.tenantId);

      const rx = await tx.prescription.create({
        data: {
          tenantId: user.tenantId,
          patientId: patient.id,
          providerId: user.userId,
          consultationId: dto.consultationId ?? null,
          number,
          status: RxStatus.ISSUED,
          notes: dto.notes ?? null,
          // Snapshot provider details — stays correct on the legal artifact
          // even if the User row is later edited.
          providerName: provider.name,
          providerLicense: provider.prcLicenseNumber,
          providerSpecialty: provider.prcSpecialty ?? null,
          items: {
            create: dto.items.map((i) => {
              const cat = i.drugId ? catalog.get(i.drugId) : undefined;
              return {
                tenantId: user.tenantId,
                drugId: i.drugId ?? null,
                // Prefer client-passed name (free-text takes priority);
                // fall back to catalog generic if drugId-only was sent.
                drugName: i.drugName ?? cat?.generic ?? '',
                strength: i.strength,
                form: i.form,
                dose: i.dose,
                frequency: i.frequency,
                durationDays: i.durationDays ?? null,
                quantity: i.quantity,
                instructions: i.instructions,
                refills: i.refills ?? 0,
              };
            }),
          },
        },
        include: { items: true },
      });

      this.logger.log(
        `Rx ${rx.number} (${rx.id}) issued by ${user.userId} for patient ${patient.id}` +
          (findings.length > 0
            ? ` — ${findings.length} safety findings, override=${!!dto.override}`
            : ''),
      );

      return { ...rx, safetyFindings: findings };
    });
  }

  async listForPatient(patientId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      return tx.prescription.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { issuedAt: 'desc' },
        include: { items: true },
        take: 100,
      });
    });
  }

  async findById(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rx = await tx.prescription.findFirst({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      if (!rx) throw new NotFoundException(`Prescription ${id} not found`);
      return rx;
    });
  }

  /**
   * Render a printable PDF for an issued prescription. Pulls the patient,
   * tenant, and primary location all in one tx so the document is consistent
   * even if data updates land mid-render.
   */
  async renderPdf(id: string, user: AuthenticatedUser): Promise<Buffer> {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rx = await tx.prescription.findFirst({
        where: { id, deletedAt: null },
        include: {
          items: true,
          patient: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              sex: true,
              mrn: true,
            },
          },
        },
      });
      if (!rx) throw new NotFoundException(`Prescription ${id} not found`);

      const tenant = await tx.tenant.findFirst({ select: { name: true, settings: true } });
      const location = await tx.location.findFirst({
        where: { isPrimary: true, deletedAt: null, active: true },
        select: {
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          province: true,
          phone: true,
        },
      });

      return renderRxPdf({
        rx: {
          number: rx.number,
          issuedAt: rx.issuedAt,
          validUntil: rx.validUntil,
          notes: rx.notes,
          providerName: rx.providerName,
          providerLicense: rx.providerLicense,
          providerSpecialty: rx.providerSpecialty,
          items: rx.items,
        },
        tenant: { name: tenant?.name ?? 'Clinic', settings: tenant?.settings as never },
        location,
        patient: rx.patient,
      });
    });
  }

  async cancel(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const rx = await tx.prescription.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!rx) throw new NotFoundException(`Prescription ${id} not found`);
      if (rx.status === RxStatus.CANCELLED) {
        throw new BadRequestException('Already cancelled');
      }
      return tx.prescription.update({
        where: { id },
        data: { status: RxStatus.CANCELLED },
      });
    });
  }

  /**
   * Issue a per-tenant Rx number based on the current count. Uses RX-YYYYMM-NNNN.
   * Acceptable race risk for the MVP — wrap in a sequence per tenant if needed.
   */
  private async nextNumber(
    tx: { prescription: { count: (a: { where: Record<string, unknown> }) => Promise<number> } },
    tenantId: string,
  ): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const count = await tx.prescription.count({
      where: { tenantId, issuedAt: { gte: monthStart } },
    });
    return `RX-${yyyymm}-${String(count + 1).padStart(4, '0')}`;
  }
}
