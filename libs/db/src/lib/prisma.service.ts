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
/**
 * Interactive-transaction limits for every withTenant / withPlatformContext
 * / $transaction(fn) call. Prisma's defaults (maxWait 2s to *obtain* a
 * connection, 5s to finish) are tuned for idle services: under a burst —
 * e.g. the e2e suite logging in from several jest workers while bcrypt
 * (cost 12) pins the CPU — requests queue on the pool for longer than 2s
 * and surface as "Unable to start a transaction in the given time", which
 * the exception filter reports as a 400 "Database request failed". Waiting
 * longer is the correct behaviour: the request is fine, the pool is busy.
 */
const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/** pg Pool size; pg's own default is 10. Override with DATABASE_POOL_MAX. */
const POOL_MAX = Number(process.env['DATABASE_POOL_MAX']) || 20;

/**
 * How long getTenantContext() may serve a tenant's kind / plan from memory.
 * Kind never changes after creation and plans change rarely (platform admin
 * action, which invalidates explicitly), so a short TTL turns the
 * per-request "is this a LAB tenant / does the plan include X" transaction
 * into a Map lookup. Per process: in a multi-instance deploy a plan change
 * made on another instance is visible here after at most this long.
 */
const TENANT_CONTEXT_TTL_MS =
  Number(process.env['TENANT_CONTEXT_TTL_MS']) || 30_000;
const TENANT_CONTEXT_CACHE_MAX = 5_000;

export interface TenantContext {
  kind: string;
  plan: string | null;
  labPlan: string | null;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient;
  private readonly tenantContextCache = new Map<
    string,
    { value: TenantContext; expiresAt: number }
  >();

  constructor() {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env['DATABASE_URL'] ?? '',
        max: POOL_MAX,
      }),
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    await this.assertNotSuperuser();
    this.logger.log('Prisma connected');
  }

  /**
   * Refuse to boot when the api is connected as a Postgres superuser or any
   * other role with `BYPASSRLS=t`. RLS is the single mechanism that keeps
   * tenant data from leaking; if RLS is bypassed every patient/consult/
   * invoice query silently goes cross-tenant.
   *
   * Set `ALLOW_SUPERUSER_DB_CONN=1` to skip this check (e.g. when running
   * one-off scripts as superuser intentionally). Don't set it in prod.
   */
  private async assertNotSuperuser(): Promise<void> {
    if (process.env['ALLOW_SUPERUSER_DB_CONN'] === '1') {
      this.logger.warn(
        'ALLOW_SUPERUSER_DB_CONN=1 — RLS may be bypassed. This must NEVER be set in prod.',
      );
      return;
    }
    const rows = await this.client.$queryRawUnsafe<
      Array<{ user: string; super: boolean; bypassrls: boolean }>
    >(
      `SELECT current_user::text AS "user",
              current_setting('is_superuser')::boolean AS "super",
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS "bypassrls"`,
    );
    const role = rows[0];
    if (!role) {
      this.logger.error('could not read current_user / role privileges');
      throw new Error('PrismaService: unable to verify connection role');
    }
    if (role.super || role.bypassrls) {
      this.logger.error(
        `connected as ${role.user} (superuser=${role.super}, bypassrls=${role.bypassrls}). ` +
          `This bypasses RLS and exposes cross-tenant data. ` +
          `Use the cliniq_app role (see tools/scripts/fix-cliniq-app-role.sql).`,
      );
      throw new Error(
        `unsafe DB role "${role.user}" — RLS would be bypassed. Refusing to start.`,
      );
    }
    this.logger.log(`Prisma role check OK (connected as ${role.user})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  // ── Proxy the most-used Prisma surface ─────────────────────

  get tenant() {
    return this.client.tenant;
  }
  get user() {
    return this.client.user;
  }
  get tenantUser() {
    return this.client.tenantUser;
  }
  get tenantInvite() {
    return this.client.tenantInvite;
  }
  get refreshSession() {
    return this.client.refreshSession;
  }
  get platformRefreshSession() {
    return this.client.platformRefreshSession;
  }
  get passwordResetToken() {
    return this.client.passwordResetToken;
  }
  get patient() {
    return this.client.patient;
  }
  get consultation() {
    return this.client.consultation;
  }
  get aiSuggestion() {
    return this.client.aiSuggestion;
  }
  get consultationAmendment() {
    return this.client.consultationAmendment;
  }
  get prescription() {
    return this.client.prescription;
  }
  get prescriptionItem() {
    return this.client.prescriptionItem;
  }
  get auditLog() {
    return this.client.auditLog;
  }
  get fileObject() {
    return this.client.fileObject;
  }
  get patientConsent() {
    return this.client.patientConsent;
  }
  get aiBudget() {
    return this.client.aiBudget;
  }
  get appointment() {
    return this.client.appointment;
  }
  get providerAvailability() {
    return this.client.providerAvailability;
  }
  get providerTimeOff() {
    return this.client.providerTimeOff;
  }
  get vital() {
    return this.client.vital;
  }
  get allergy() {
    return this.client.allergy;
  }
  get medication() {
    return this.client.medication;
  }
  get condition() {
    return this.client.condition;
  }
  get service() {
    return this.client.service;
  }
  get invoice() {
    return this.client.invoice;
  }
  get invoiceItem() {
    return this.client.invoiceItem;
  }
  get payment() {
    return this.client.payment;
  }
  get dataSubjectRequest() {
    return this.client.dataSubjectRequest;
  }
  get inventoryItem() {
    return this.client.inventoryItem;
  }
  get stockBatch() {
    return this.client.stockBatch;
  }
  get stockMovement() {
    return this.client.stockMovement;
  }
  get hmoProvider() {
    return this.client.hmoProvider;
  }
  get hmoMembership() {
    return this.client.hmoMembership;
  }
  get hmoClaim() {
    return this.client.hmoClaim;
  }
  get labOrder() {
    return this.client.labOrder;
  }
  get labOrderItem() {
    return this.client.labOrderItem;
  }
  get criticalValueRule() {
    return this.client.criticalValueRule;
  }
  get teleSession() {
    return this.client.teleSession;
  }
  get teleSignal() {
    return this.client.teleSignal;
  }
  get pushToken() {
    return this.client.pushToken;
  }
  get notification() {
    return this.client.notification;
  }
  get dentalChart() {
    return this.client.dentalChart;
  }
  get dentalToothEntry() {
    return this.client.dentalToothEntry;
  }
  get dentalSurfaceFinding() {
    return this.client.dentalSurfaceFinding;
  }
  get delegation() {
    return this.client.delegation;
  }
  get drug() {
    return this.client.drug;
  }
  get icdCode() {
    return this.client.icdCode;
  }
  get location() {
    return this.client.location;
  }
  get platformAdmin() {
    return this.client.platformAdmin;
  }
  get dentalLabClinicLink() {
    return this.client.dentalLabClinicLink;
  }
  get dentalLabProductCategory() {
    return this.client.dentalLabProductCategory;
  }
  get dentalLabProduct() {
    return this.client.dentalLabProduct;
  }
  get dentalLabCase() {
    return this.client.dentalLabCase;
  }
  get dentalLabCaseFile() {
    return this.client.dentalLabCaseFile;
  }
  get dentalLabCasePhaseEvent() {
    return this.client.dentalLabCasePhaseEvent;
  }
  get dentalLabCaseNote() {
    return this.client.dentalLabCaseNote;
  }
  get dentalLabCaseMessage() {
    return this.client.dentalLabCaseMessage;
  }
  get dentalLabCaseTag() {
    return this.client.dentalLabCaseTag;
  }
  get dentalLabCaseTagAssignment() {
    return this.client.dentalLabCaseTagAssignment;
  }
  get dentalLabShipment() {
    return this.client.dentalLabShipment;
  }
  get dentalLabMaterial() {
    return this.client.dentalLabMaterial;
  }
  get dentalLabMaterialLot() {
    return this.client.dentalLabMaterialLot;
  }
  get dentalLabMaterialUsage() {
    return this.client.dentalLabMaterialUsage;
  }
  get dentalLabConformityDocTemplate() {
    return this.client.dentalLabConformityDocTemplate;
  }
  get dentalLabConsentTemplate() {
    return this.client.dentalLabConsentTemplate;
  }
  get dentalLabConsentSignature() {
    return this.client.dentalLabConsentSignature;
  }
  get dentalLabInvoice() {
    return this.client.dentalLabInvoice;
  }
  get dentalLabInvoiceItem() {
    return this.client.dentalLabInvoiceItem;
  }
  get dentalLabPaymentLink() {
    return this.client.dentalLabPaymentLink;
  }
  get dentalLabTreatmentPlan() {
    return this.client.dentalLabTreatmentPlan;
  }
  get dentalLabTreatmentPlanFile() {
    return this.client.dentalLabTreatmentPlanFile;
  }
  get dentalLabTreatmentPlanApproval() {
    return this.client.dentalLabTreatmentPlanApproval;
  }
  get dentalLabCaseDispute() {
    return this.client.dentalLabCaseDispute;
  }
  get dentalLabCaseDisputeMessage() {
    return this.client.dentalLabCaseDisputeMessage;
  }
  get queue() {
    return this.client.queue;
  }
  get queueTicket() {
    return this.client.queueTicket;
  }
  get obPregnancy() {
    return this.client.obPregnancy;
  }
  get obVisit() {
    return this.client.obVisit;
  }
  get ultrasoundReport() {
    return this.client.ultrasoundReport;
  }
  get ultrasoundFile() {
    return this.client.ultrasoundFile;
  }

  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  $transaction<T>(promises: Array<Promise<T>>): Promise<T[]>;
  $transaction(arg: unknown): unknown {
    return typeof arg === 'function'
      ? this.client.$transaction(arg as never, TX_OPTIONS)
      : this.client.$transaction(arg as never);
  }

  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T> {
    return this.client.$queryRaw(query, ...values) as Promise<T>;
  }

  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number> {
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
      throw new Error(
        `PrismaService.withTenant: invalid tenantId "${tenantId}"`,
      );
    }
    if (userId !== null && !isCuidLike(userId)) {
      throw new Error(`PrismaService.withTenant: invalid userId "${userId}"`);
    }
    return this.client.$transaction(async (tx) => {
      // Both GUCs in ONE round trip (set_config(..., is_local=true) is
      // SET LOCAL): every withTenant call used to spend two statements here
      // before running any real query. Parameterised, so the isCuidLike
      // guards above are belt-and-braces rather than the injection defence.
      // app.current_user collides with the reserved keyword `current_user`.
      await tx.$queryRaw`SELECT set_config('app.current_tenant', ${tenantId}, true), set_config('app.current_user_id', ${userId ?? ''}, true)`;
      return fn(tx as unknown as PrismaClient);
    }, TX_OPTIONS);
  }

  /**
   * Run a callback inside a transaction with `app.platform_admin = '1'` set,
   * which trips the bypass policies in 20260506110000_platform_rls_bypass.
   * Use ONLY from the platform admin module, where cross-tenant reads/writes
   * are intentional. SET LOCAL ensures the flag dies with the transaction.
   */
  async withPlatformContext<T>(
    fn: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.platform_admin', '1', true)`;
      return fn(tx as unknown as PrismaClient);
    }, TX_OPTIONS);
  }

  /**
   * Read a tenant's kind / plan / labPlan in a way that survives RLS.
   *
   * Service-layer "is this a LAB tenant?" checks (the `requireLab` /
   * `assertLabTenant` helpers scattered across the lab module) used to
   * call `prisma.tenant.findUnique` directly. Under the cliniq_app role
   * that returns null, because `tenants_self_read` requires
   * `current_tenant_id()` to match — and these helpers run BEFORE the
   * route's own `withTenant` wrap. Centralise the lookup here so every
   * caller sets the right context.
   */
  async getTenantContext(tenantId: string): Promise<TenantContext | null> {
    if (!isCuidLike(tenantId)) return null;
    const hit = this.tenantContextCache.get(tenantId);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await this.withTenant(tenantId, null, (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { kind: true, plan: true, labPlan: true },
      }),
    );
    // Only positive results are cached: a null (tenant not visible yet, or
    // just created) must be re-checked on the next request.
    if (value) {
      if (this.tenantContextCache.size >= TENANT_CONTEXT_CACHE_MAX) {
        this.tenantContextCache.clear();
      }
      this.tenantContextCache.set(tenantId, {
        value,
        expiresAt: Date.now() + TENANT_CONTEXT_TTL_MS,
      });
    }
    return value;
  }

  /** Call after changing a tenant's kind / plan / labPlan. */
  invalidateTenantContext(tenantId: string): void {
    this.tenantContextCache.delete(tenantId);
  }
}

// Accept CUIDs ([a-z0-9]{20-40}) and UUIDs (8-4-4-4-12 hex). The goal here is
// to defeat SQL injection in `SET LOCAL` — alphanumerics + hyphens are safe.
function isCuidLike(value: string): boolean {
  return /^[a-z0-9-]{20,40}$/.test(value);
}
