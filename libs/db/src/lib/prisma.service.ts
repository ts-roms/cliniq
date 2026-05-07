import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * NestJS-friendly wrapper around PrismaClient.
 *
 * We use composition (not class extension) because Prisma 7's PrismaClient is a
 * native ES class, and bundling NestJS + SWC + a class-extending wrapper produces
 * "Class constructor cannot be invoked without 'new'" at runtime. Composition is
 * safer and the proxied surface is what services actually use.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env['DATABASE_URL'] ?? '',
      }),
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  // ── Proxy the most-used Prisma surface ─────────────────────

  get tenant() { return this.client.tenant; }
  get user() { return this.client.user; }
  get tenantUser() { return this.client.tenantUser; }
  get patient() { return this.client.patient; }
  get consultation() { return this.client.consultation; }
  get aiSuggestion() { return this.client.aiSuggestion; }
  get prescription() { return this.client.prescription; }
  get prescriptionItem() { return this.client.prescriptionItem; }
  get auditLog() { return this.client.auditLog; }
  get fileObject() { return this.client.fileObject; }
  get patientConsent() { return this.client.patientConsent; }
  get aiBudget() { return this.client.aiBudget; }
  get appointment() { return this.client.appointment; }
  get vital() { return this.client.vital; }
  get allergy() { return this.client.allergy; }
  get medication() { return this.client.medication; }
  get condition() { return this.client.condition; }
  get service() { return this.client.service; }
  get invoice() { return this.client.invoice; }
  get invoiceItem() { return this.client.invoiceItem; }
  get payment() { return this.client.payment; }
  get dataSubjectRequest() { return this.client.dataSubjectRequest; }
  get inventoryItem() { return this.client.inventoryItem; }
  get stockBatch() { return this.client.stockBatch; }
  get stockMovement() { return this.client.stockMovement; }
  get hmoProvider() { return this.client.hmoProvider; }
  get hmoMembership() { return this.client.hmoMembership; }
  get hmoClaim() { return this.client.hmoClaim; }
  get labOrder() { return this.client.labOrder; }
  get labOrderItem() { return this.client.labOrderItem; }
  get teleSession() { return this.client.teleSession; }
  get teleSignal() { return this.client.teleSignal; }
  get notification() { return this.client.notification; }
  get dentalChart() { return this.client.dentalChart; }
  get dentalToothEntry() { return this.client.dentalToothEntry; }
  get dentalSurfaceFinding() { return this.client.dentalSurfaceFinding; }
  get delegation() { return this.client.delegation; }
  get drug() { return this.client.drug; }
  get icdCode() { return this.client.icdCode; }
  get location() { return this.client.location; }
  get platformAdmin() { return this.client.platformAdmin; }
  get labClinicLink() { return this.client.labClinicLink; }
  get labProductCategory() { return this.client.labProductCategory; }
  get labProduct() { return this.client.labProduct; }
  get labCase() { return this.client.labCase; }
  get labCaseFile() { return this.client.labCaseFile; }
  get labCasePhaseEvent() { return this.client.labCasePhaseEvent; }
  get labCaseNote() { return this.client.labCaseNote; }
  get labCaseMessage() { return this.client.labCaseMessage; }
  get labCaseTag() { return this.client.labCaseTag; }
  get labCaseTagAssignment() { return this.client.labCaseTagAssignment; }
  get labShipment() { return this.client.labShipment; }
  get labMaterial() { return this.client.labMaterial; }
  get labMaterialLot() { return this.client.labMaterialLot; }
  get labMaterialUsage() { return this.client.labMaterialUsage; }
  get labConformityDocTemplate() { return this.client.labConformityDocTemplate; }
  get labConsentTemplate() { return this.client.labConsentTemplate; }
  get labConsentSignature() { return this.client.labConsentSignature; }
  get labInvoice() { return this.client.labInvoice; }
  get labInvoiceItem() { return this.client.labInvoiceItem; }
  get labPaymentLink() { return this.client.labPaymentLink; }
  get labTreatmentPlan() { return this.client.labTreatmentPlan; }
  get labTreatmentPlanFile() { return this.client.labTreatmentPlanFile; }
  get labTreatmentPlanApproval() { return this.client.labTreatmentPlanApproval; }

  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  $transaction<T>(promises: Array<Promise<T>>): Promise<T[]>;
  $transaction(arg: unknown): unknown {
    return this.client.$transaction(arg as never);
  }

  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    return this.client.$queryRaw(query, ...values) as Promise<T>;
  }

  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number> {
    return this.client.$executeRaw(query, ...values);
  }

  $executeRawUnsafe(query: string): Promise<number> {
    return this.client.$executeRawUnsafe(query);
  }

  /**
   * Run a callback inside a transaction with the per-request RLS GUCs set.
   *
   *   await prisma.withTenant(tenantId, userId, async (tx) => {
   *     return tx.patient.findMany();   // RLS enforces tenantId
   *   });
   */
  async withTenant<T>(
    tenantId: string,
    userId: string | null,
    fn: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    if (!isCuidLike(tenantId)) {
      throw new Error(`PrismaService.withTenant: invalid tenantId "${tenantId}"`);
    }
    if (userId !== null && !isCuidLike(userId)) {
      throw new Error(`PrismaService.withTenant: invalid userId "${userId}"`);
    }
    return this.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      // app.current_user collides with the reserved keyword `current_user`.
      await tx.$executeRawUnsafe(`SET LOCAL app.current_user_id = '${userId ?? ''}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }

  /**
   * Run a callback inside a transaction with `app.platform_admin = '1'` set,
   * which trips the bypass policies in 20260506110000_platform_rls_bypass.
   * Use ONLY from the platform admin module, where cross-tenant reads/writes
   * are intentional. SET LOCAL ensures the flag dies with the transaction.
   */
  async withPlatformContext<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.platform_admin = '1'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
}

// Accept CUIDs ([a-z0-9]{20-40}) and UUIDs (8-4-4-4-12 hex). The goal here is
// to defeat SQL injection in `SET LOCAL` — alphanumerics + hyphens are safe.
function isCuidLike(value: string): boolean {
  return /^[a-z0-9-]{20,40}$/.test(value);
}
