// Direct fetcher for the Lab module API. Uses the tenant session JWT (same
// session as the rest of the clinic app — labs are tenants too). Now backed
// by the generated `@org/api-client` typed SDK; cookies ride on every call
// via the globally configured client (see apps/web/app/providers.tsx).

import { clearSession } from '@/features/auth';
import {
  clinicLabCasesControllerConfirmFile,
  clinicLabCasesControllerCreate,
  clinicLabCasesControllerCreateMessage,
  clinicLabCasesControllerFindOne,
  clinicLabCasesControllerGetShipment,
  clinicLabCasesControllerList,
  clinicLabCasesControllerListMessages,
  clinicLabCasesControllerListPhases,
  clinicLabCasesControllerMarkDelivered,
  clinicLabCasesControllerPresignFile,
  clinicLabCasesControllerTransition,
  clinicLabDisputesControllerClose,
  clinicLabDisputesControllerList,
  clinicLabDisputesControllerOpen,
  clinicLabDisputesControllerPostMessage,
  clinicLabInvitationsControllerAccept,
  clinicLabInvitationsControllerList,
  clinicLabInvitationsControllerReject,
  clinicLabInvoicesControllerFindOne,
  clinicLabInvoicesControllerGetPdf,
  clinicLabInvoicesControllerList,
  clinicLabTreatmentPlansControllerDecide,
  clinicLabTreatmentPlansControllerFindOne,
  clinicLabTreatmentPlansControllerList,
  dentalLabCasesControllerAdvancePhase,
  dentalLabCasesControllerConfirmFile,
  dentalLabCasesControllerCreateMessage,
  dentalLabCasesControllerCreateNote,
  dentalLabCasesControllerDeleteNote,
  dentalLabCasesControllerFindOne,
  dentalLabCasesControllerGetShipment,
  dentalLabCasesControllerList,
  dentalLabCasesControllerListMessages,
  dentalLabCasesControllerListNotes,
  dentalLabCasesControllerListPhases,
  dentalLabCasesControllerMarkDelivered,
  dentalLabCasesControllerPresignFile,
  dentalLabCasesControllerTransition,
  dentalLabCasesControllerUpdate,
  dentalLabCasesControllerUpdateNote,
  dentalLabCasesControllerUpsertShipment,
  dentalLabClinicLinksControllerInvite,
  dentalLabClinicLinksControllerList,
  dentalLabClinicLinksControllerRevoke,
  dentalLabComplianceControllerCaptureFromClinic,
  dentalLabComplianceControllerCreateConformity,
  dentalLabComplianceControllerCreateConsent,
  dentalLabComplianceControllerListConformity,
  dentalLabComplianceControllerListConsentClinic,
  dentalLabComplianceControllerListConsentLab,
  dentalLabComplianceControllerListSignaturesClinic,
  dentalLabComplianceControllerListSignaturesLab,
  dentalLabComplianceControllerRemoveConformity,
  dentalLabComplianceControllerRemoveConsent,
  dentalLabComplianceControllerRenderConformityPdf,
  dentalLabDisputesControllerClose,
  dentalLabDisputesControllerList,
  dentalLabDisputesControllerOpen,
  dentalLabDisputesControllerPostMessage,
  dentalLabInvoicesControllerAddItem,
  dentalLabInvoicesControllerCancelPaymentLink,
  dentalLabInvoicesControllerCreate,
  dentalLabInvoicesControllerCreatePaymentLink,
  dentalLabInvoicesControllerDeleteItem,
  dentalLabInvoicesControllerFindOne,
  dentalLabInvoicesControllerGenerate,
  dentalLabInvoicesControllerGeneratePdf,
  dentalLabInvoicesControllerIssue,
  dentalLabInvoicesControllerList,
  dentalLabInvoicesControllerRecordPayment,
  dentalLabInvoicesControllerSweep,
  dentalLabInvoicesControllerUpdate,
  dentalLabInvoicesControllerUpdateItem,
  dentalLabInvoicesControllerVoidInvoice,
  dentalLabMaterialsControllerCreate,
  dentalLabMaterialsControllerCreateLot,
  dentalLabMaterialsControllerDeleteUsage,
  dentalLabMaterialsControllerList,
  dentalLabMaterialsControllerListLots,
  dentalLabMaterialsControllerListUsages,
  dentalLabMaterialsControllerRecordUsage,
  dentalLabMaterialsControllerRemove,
  dentalLabMaterialsControllerUpdateLot,
  dentalLabProductsControllerCloneProduct,
  dentalLabProductsControllerCreateCategory,
  dentalLabProductsControllerCreateProduct,
  dentalLabProductsControllerListCategories,
  dentalLabProductsControllerListProducts,
  dentalLabProductsControllerUpdateProduct,
  dentalLabStatsControllerOverview,
  dentalLabTagsControllerAssign,
  dentalLabTagsControllerCreate,
  dentalLabTagsControllerList,
  dentalLabTagsControllerListForCase,
  dentalLabTagsControllerRemove,
  dentalLabTagsControllerUnassign,
  dentalLabTreatmentPlansControllerCreate,
  dentalLabTreatmentPlansControllerDeleteFile,
  dentalLabTreatmentPlansControllerDraftSummary,
  dentalLabTreatmentPlansControllerFindOne,
  dentalLabTreatmentPlansControllerList,
  dentalLabTreatmentPlansControllerPresignFile,
  dentalLabTreatmentPlansControllerPropose,
  dentalLabTreatmentPlansControllerUpdate,
} from '@org/api-client';

export class LabApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
}

async function unwrap<T>(
  promise: Promise<{ data?: unknown; error?: unknown; response?: Response }>,
): Promise<T> {
  const result = await promise;
  // No response = network/transport failure (fetch threw, DNS, CORS preflight,
  // etc.). Surface as a 0-status LabApiError so callers can branch on it
  // like any other failure.
  if (!result.response) {
    throw new LabApiError(
      0,
      result.error ?? null,
      'request failed: no response',
    );
  }
  if (result.response.ok) {
    return (result.data ?? null) as T;
  }
  const status = result.response.status;
  if (status === 401) clearSession();
  const body = (result.error ?? result.data) as unknown;
  const fromBody =
    body && typeof body === 'object'
      ? (body as { message?: string }).message
      : undefined;
  const message = fromBody ?? `request failed: ${status}`;
  throw new LabApiError(status, body, message);
}

// ── Shared types ─────────────────────────────────────────────

export type DentalLabClinicLinkStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'REJECTED'
  | 'REVOKED'
  | 'SUSPENDED';

export type DentalLabCaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'AWAITING_PICKUP'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REJECTED';

export type DentalLabCaseUrgency = 'STANDARD' | 'URGENT';

export type DentalLabProductPricingMode =
  | 'FIXED'
  | 'PER_RATE_PROFILE'
  | 'ADJUST_ON_ORDER'
  | 'VARIABLE_PER_TIER';

export interface LabClinicLinkSummary {
  id: string;
  labTenantId: string;
  clinicTenantId: string;
  status: DentalLabClinicLinkStatus;
  invitedAt: string;
  respondedAt: string | null;
  inviteNote: string | null;
  lab?: { id: string; slug: string; name: string; labSpecialty: string | null };
  clinic?: { id: string; slug: string; name: string; type: string };
}

export interface DentalLabProductCategory {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
}

export interface LabProductSummary {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  defaultPrice: number | null;
  currency: string;
  pricingMode: DentalLabProductPricingMode;
  phases: string[];
  tags: string[];
  isActive: boolean;
  category?: { id: string; name: string } | null;
}

export interface LabCaseSummary {
  id: string;
  refNumber: number | null;
  labTenantId: string;
  clinicTenantId: string;
  productId: string;
  status: DentalLabCaseStatus;
  urgency: DentalLabCaseUrgency;
  unitPrice: number | null;
  currency: string;
  dueAt: string | null;
  patientLabel: string | null;
  doctorLabel: string | null;
  createdAt: string;
  product?: { id: string; name: string };
  lab?: { id: string; slug: string; name: string };
  clinic?: { id: string; slug: string; name: string };
  _count?: { files: number };
  /** Lab-side only — clinic-side responses don't include tagAssignments. */
  tagAssignments?: Array<{ tagId: string; tag: LabCaseTagRef }>;
}

interface LabCaseTagRef {
  id: string;
  name: string;
  color: string;
}

export interface DentalLabCaseFile {
  id: string;
  s3Key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'PENDING' | 'READY';
  createdAt: string;
}

export interface LabCaseDetail extends LabCaseSummary {
  formData: Record<string, unknown> | null;
  notes: string | null;
  deliveryCenter: string | null;
  files: DentalLabCaseFile[];
  product: {
    id: string;
    name: string;
    description: string | null;
    defaultPrice: number | null;
    currency: string;
    formSchema: Record<string, unknown> | null;
    phases: string[];
  };
}

// ── Clinic links ─────────────────────────────────────────────

export function inviteClinic(input: {
  clinicSlug: string;
  inviteNote?: string;
}) {
  return unwrap<LabClinicLinkSummary>(
    dentalLabClinicLinksControllerInvite({ body: input as never }),
  );
}

export function listLabClinicLinks() {
  return unwrap<LabClinicLinkSummary[]>(dentalLabClinicLinksControllerList({}));
}

export function revokeLabInvitation(id: string) {
  return unwrap<LabClinicLinkSummary>(
    dentalLabClinicLinksControllerRevoke({ path: { id } }),
  );
}

// ── Clinic-side: invitations ─────────────────────────────────

export function listClinicInvitations() {
  return unwrap<LabClinicLinkSummary[]>(clinicLabInvitationsControllerList({}));
}

export function acceptInvitation(id: string) {
  return unwrap<LabClinicLinkSummary>(
    clinicLabInvitationsControllerAccept({ path: { id } }),
  );
}

export function rejectInvitation(id: string) {
  return unwrap<LabClinicLinkSummary>(
    clinicLabInvitationsControllerReject({ path: { id } }),
  );
}

// ── Catalog (lab side) ──────────────────────────────────────

export function listCategories() {
  return unwrap<DentalLabProductCategory[]>(
    dentalLabProductsControllerListCategories({}),
  );
}

export function createCategory(input: {
  name: string;
  description?: string;
  parentId?: string;
}) {
  return unwrap<DentalLabProductCategory>(
    dentalLabProductsControllerCreateCategory({ body: input as never }),
  );
}

export function listProducts(opts?: {
  activeOnly?: boolean;
  categoryId?: string;
}) {
  const query: { activeOnly?: boolean; categoryId?: string } = {};
  if (opts?.activeOnly) query.activeOnly = true;
  if (opts?.categoryId) query.categoryId = opts.categoryId;
  return unwrap<LabProductSummary[]>(
    dentalLabProductsControllerListProducts({ query: query as never }),
  );
}

export interface CreateProductInput {
  name: string;
  description?: string;
  sku?: string;
  categoryId?: string;
  defaultPrice?: number; // centavos
  currency?: string;
  pricingMode?: DentalLabProductPricingMode;
  phases?: string[];
  tags?: string[];
  formSchema?: Record<string, unknown>;
}

export function createProduct(input: CreateProductInput) {
  return unwrap<LabProductSummary>(
    dentalLabProductsControllerCreateProduct({ body: input as never }),
  );
}

export function updateProduct(
  id: string,
  input: Partial<CreateProductInput> & { isActive?: boolean },
) {
  return unwrap<LabProductSummary>(
    dentalLabProductsControllerUpdateProduct({
      path: { id },
      body: input as never,
    }),
  );
}

export function cloneProduct(id: string) {
  return unwrap<LabProductSummary>(
    dentalLabProductsControllerCloneProduct({ path: { id } }),
  );
}

// ── Cases (lab side) ─────────────────────────────────────────

export function listLabCases(opts?: {
  status?: DentalLabCaseStatus;
  tagId?: string;
}) {
  const query: { status?: DentalLabCaseStatus; tagId?: string } = {};
  if (opts?.status) query.status = opts.status;
  if (opts?.tagId) query.tagId = opts.tagId;
  return unwrap<LabCaseSummary[]>(
    dentalLabCasesControllerList({ query: query as never }),
  );
}

export function getLabCase(id: string) {
  return unwrap<LabCaseDetail>(
    dentalLabCasesControllerFindOne({ path: { id } }),
  );
}

export function transitionLabCase(
  id: string,
  status: DentalLabCaseStatus,
  reason?: string,
) {
  return unwrap<LabCaseSummary>(
    dentalLabCasesControllerTransition({
      path: { id },
      body: { status, reason } as never,
    }),
  );
}

export function updateLabCaseAsLab(
  id: string,
  input: { unitPrice?: number; notes?: string },
) {
  return unwrap<LabCaseSummary>(
    dentalLabCasesControllerUpdate({ path: { id }, body: input as never }),
  );
}

// ── Phases ──────────────────────────────────────────────────

export interface DentalLabCasePhaseEvent {
  id: string;
  caseId: string;
  phase: string;
  enteredAt: string;
  enteredByUserId: string;
  exitedAt: string | null;
  notes: string | null;
}

export function listLabCasePhases(caseId: string) {
  return unwrap<DentalLabCasePhaseEvent[]>(
    dentalLabCasesControllerListPhases({ path: { id: caseId } }),
  );
}

export function listClinicCasePhases(caseId: string) {
  return unwrap<DentalLabCasePhaseEvent[]>(
    clinicLabCasesControllerListPhases({ path: { id: caseId } }),
  );
}

export function advanceLabCasePhase(
  caseId: string,
  input: { phase?: string; notes?: string },
) {
  return unwrap<DentalLabCasePhaseEvent>(
    dentalLabCasesControllerAdvancePhase({
      path: { id: caseId },
      body: input as never,
    }),
  );
}

// ── Compliance: conformity + consent templates ──────────────

export interface LabComplianceTemplate {
  id: string;
  tenantId: string;
  productId: string | null;
  name: string;
  body: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DentalLabConsentSignature {
  id: string;
  caseId: string;
  templateId: string;
  signedByName: string;
  signedByRole: string | null;
  signatureFileKey: string;
  ipAddress: string | null;
  signedAt: string;
  bodySnapshot: string;
  template?: { id: string; name: string };
}

export function listConformityTemplates() {
  return unwrap<LabComplianceTemplate[]>(
    dentalLabComplianceControllerListConformity({}),
  );
}
export function createConformityTemplate(input: {
  name: string;
  body: string;
  productId?: string;
  isDefault?: boolean;
}) {
  return unwrap<LabComplianceTemplate>(
    dentalLabComplianceControllerCreateConformity({ body: input as never }),
  );
}
export function deleteConformityTemplate(id: string) {
  return unwrap<void>(
    dentalLabComplianceControllerRemoveConformity({ path: { id } }),
  );
}

export function listLabConsentTemplates() {
  return unwrap<LabComplianceTemplate[]>(
    dentalLabComplianceControllerListConsentLab({}),
  );
}
export function listClinicConsentTemplates() {
  return unwrap<LabComplianceTemplate[]>(
    dentalLabComplianceControllerListConsentClinic({}),
  );
}
export function createConsentTemplate(input: {
  name: string;
  body: string;
  productId?: string;
  isDefault?: boolean;
}) {
  return unwrap<LabComplianceTemplate>(
    dentalLabComplianceControllerCreateConsent({ body: input as never }),
  );
}
export function deleteConsentTemplate(id: string) {
  return unwrap<void>(
    dentalLabComplianceControllerRemoveConsent({ path: { id } }),
  );
}

export function listLabCaseSignatures(caseId: string) {
  return unwrap<DentalLabConsentSignature[]>(
    dentalLabComplianceControllerListSignaturesLab({ path: { caseId } }),
  );
}
export function listClinicCaseSignatures(caseId: string) {
  return unwrap<DentalLabConsentSignature[]>(
    dentalLabComplianceControllerListSignaturesClinic({ path: { caseId } }),
  );
}
export function captureClinicCaseSignature(
  caseId: string,
  input: {
    templateId: string;
    signedByName: string;
    signedByRole?: string;
    signatureFileKey: string;
  },
) {
  return unwrap<DentalLabConsentSignature>(
    dentalLabComplianceControllerCaptureFromClinic({
      path: { caseId },
      body: input as never,
    }),
  );
}

// ── Materials + LOTs ────────────────────────────────────────

export type DentalLabMaterialLotStatus =
  | 'ACTIVE'
  | 'WAREHOUSE'
  | 'FINISHED'
  | 'DEFECTIVE'
  | 'EXPIRED';

export interface DentalLabMaterial {
  id: string;
  tenantId: string;
  sku: string | null;
  name: string;
  category: string | null;
  unitOfMeasure: string;
  description: string | null;
  defaultSupplier: string | null;
  lots?: Array<{
    id: string;
    status: DentalLabMaterialLotStatus;
    remainingQty: number;
  }>;
}

export interface DentalLabMaterialLot {
  id: string;
  materialId: string;
  lotNumber: string;
  manufacturer: string | null;
  supplier: string | null;
  initialQty: number;
  remainingQty: number;
  unitPriceCents: number | null;
  receivedAt: string;
  expiresAt: string | null;
  status: DentalLabMaterialLotStatus;
  notes: string | null;
}

export interface DentalLabMaterialUsage {
  id: string;
  caseId: string;
  lotId: string;
  qty: number;
  usedAt: string;
  usedByUserId: string;
  lot?: DentalLabMaterialLot & { material: DentalLabMaterial };
}

export function listMaterials() {
  return unwrap<DentalLabMaterial[]>(dentalLabMaterialsControllerList({}));
}

export function createMaterial(input: {
  name: string;
  sku?: string;
  category?: string;
  unitOfMeasure?: string;
  description?: string;
  defaultSupplier?: string;
}) {
  return unwrap<DentalLabMaterial>(
    dentalLabMaterialsControllerCreate({ body: input as never }),
  );
}

export function deleteMaterial(id: string) {
  return unwrap<void>(dentalLabMaterialsControllerRemove({ path: { id } }));
}

export function listMaterialLots(materialId: string) {
  return unwrap<DentalLabMaterialLot[]>(
    dentalLabMaterialsControllerListLots({ path: { id: materialId } }),
  );
}

export function createMaterialLot(
  materialId: string,
  input: {
    lotNumber: string;
    manufacturer?: string;
    supplier?: string;
    initialQty: number;
    unitPriceCents?: number;
    expiresAt?: string;
    receivedAt?: string;
    notes?: string;
  },
) {
  return unwrap<DentalLabMaterialLot>(
    dentalLabMaterialsControllerCreateLot({
      path: { id: materialId },
      body: input as never,
    }),
  );
}

export function updateMaterialLot(
  lotId: string,
  input: {
    status?: DentalLabMaterialLotStatus;
    expiresAt?: string | null;
    notes?: string | null;
  },
) {
  return unwrap<DentalLabMaterialLot>(
    dentalLabMaterialsControllerUpdateLot({
      path: { lotId },
      body: input as never,
    }),
  );
}

export function listCaseMaterialUsages(caseId: string) {
  return unwrap<DentalLabMaterialUsage[]>(
    dentalLabMaterialsControllerListUsages({ path: { caseId } }),
  );
}

export function recordCaseMaterialUsage(
  caseId: string,
  input: { lotId: string; qty: number },
) {
  return unwrap<DentalLabMaterialUsage>(
    dentalLabMaterialsControllerRecordUsage({
      path: { caseId },
      body: input as never,
    }),
  );
}

export function deleteCaseMaterialUsage(caseId: string, usageId: string) {
  return unwrap<void>(
    dentalLabMaterialsControllerDeleteUsage({
      path: { caseId, usageId },
    }),
  );
}

// ── Shipments ───────────────────────────────────────────────

export interface DentalLabShipment {
  id: string;
  caseId: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string;
  deliveredAt: string | null;
  notes: string | null;
}

export function getLabCaseShipment(caseId: string) {
  return unwrap<DentalLabShipment | null>(
    dentalLabCasesControllerGetShipment({ path: { id: caseId } }),
  );
}

export function upsertLabCaseShipment(
  caseId: string,
  input: {
    carrier?: string | null;
    trackingNumber?: string | null;
    notes?: string | null;
  },
) {
  return unwrap<DentalLabShipment>(
    dentalLabCasesControllerUpsertShipment({
      path: { id: caseId },
      body: input as never,
    }),
  );
}

export function markLabCaseDelivered(caseId: string) {
  return unwrap<DentalLabShipment>(
    dentalLabCasesControllerMarkDelivered({ path: { id: caseId } }),
  );
}

export function getClinicCaseShipment(caseId: string) {
  return unwrap<DentalLabShipment | null>(
    clinicLabCasesControllerGetShipment({ path: { id: caseId } }),
  );
}

export function markClinicCaseDelivered(caseId: string) {
  return unwrap<DentalLabShipment>(
    clinicLabCasesControllerMarkDelivered({ path: { id: caseId } }),
  );
}

// ── Tags (lab-only) ─────────────────────────────────────────

export interface DentalLabCaseTag {
  id: string;
  tenantId: string;
  name: string;
  color: string;
}

export function listLabTags() {
  return unwrap<DentalLabCaseTag[]>(dentalLabTagsControllerList({}));
}

export function createLabTag(input: { name: string; color?: string }) {
  return unwrap<DentalLabCaseTag>(
    dentalLabTagsControllerCreate({ body: input as never }),
  );
}

export function deleteLabTag(id: string) {
  return unwrap<void>(dentalLabTagsControllerRemove({ path: { id } }));
}

export function listCaseTags(caseId: string) {
  return unwrap<DentalLabCaseTag[]>(
    dentalLabTagsControllerListForCase({ path: { caseId } }),
  );
}

export function assignCaseTag(caseId: string, tagId: string) {
  return unwrap<unknown>(
    dentalLabTagsControllerAssign({
      path: { caseId },
      body: { tagId } as never,
    }),
  );
}

export function unassignCaseTag(caseId: string, tagId: string) {
  return unwrap<void>(
    dentalLabTagsControllerUnassign({ path: { caseId, tagId } }),
  );
}

// ── Notes (lab-only) ────────────────────────────────────────

export interface DentalLabCaseNote {
  id: string;
  caseId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export function listLabCaseNotes(caseId: string) {
  return unwrap<DentalLabCaseNote[]>(
    dentalLabCasesControllerListNotes({ path: { id: caseId } }),
  );
}

export function createLabCaseNote(caseId: string, body: string) {
  return unwrap<DentalLabCaseNote>(
    dentalLabCasesControllerCreateNote({
      path: { id: caseId },
      body: { body } as never,
    }),
  );
}

export function updateLabCaseNote(
  caseId: string,
  noteId: string,
  body: string,
) {
  return unwrap<DentalLabCaseNote>(
    dentalLabCasesControllerUpdateNote({
      path: { id: caseId, noteId },
      body: { body } as never,
    }),
  );
}

export function deleteLabCaseNote(caseId: string, noteId: string) {
  return unwrap<void>(
    dentalLabCasesControllerDeleteNote({ path: { id: caseId, noteId } }),
  );
}

// ── Messages (chat — both sides) ────────────────────────────

export interface DentalLabCaseMessage {
  id: string;
  caseId: string;
  senderUserId: string;
  senderTenantId: string;
  body: string;
  createdAt: string;
}

export function listLabCaseMessages(caseId: string) {
  return unwrap<DentalLabCaseMessage[]>(
    dentalLabCasesControllerListMessages({ path: { id: caseId } }),
  );
}

export function createLabCaseMessage(caseId: string, body: string) {
  return unwrap<DentalLabCaseMessage>(
    dentalLabCasesControllerCreateMessage({
      path: { id: caseId },
      body: { body } as never,
    }),
  );
}

export function listClinicCaseMessages(caseId: string) {
  return unwrap<DentalLabCaseMessage[]>(
    clinicLabCasesControllerListMessages({ path: { id: caseId } }),
  );
}

export function createClinicCaseMessage(caseId: string, body: string) {
  return unwrap<DentalLabCaseMessage>(
    clinicLabCasesControllerCreateMessage({
      path: { id: caseId },
      body: { body } as never,
    }),
  );
}

// ── Cases (clinic side) ─────────────────────────────────────

export interface CreateCaseInput {
  labTenantId: string;
  productId: string;
  urgency?: DentalLabCaseUrgency;
  dueAt?: string; // ISO
  formData?: Record<string, unknown>;
  patientLabel?: string;
  doctorLabel?: string;
  deliveryCenter?: string;
  notes?: string;
}

export function listClinicCases(opts?: { status?: DentalLabCaseStatus }) {
  const query: { status?: DentalLabCaseStatus } = {};
  if (opts?.status) query.status = opts.status;
  return unwrap<LabCaseSummary[]>(
    clinicLabCasesControllerList({ query: query as never }),
  );
}

export function getClinicCase(id: string) {
  return unwrap<LabCaseDetail>(
    clinicLabCasesControllerFindOne({ path: { id } }),
  );
}

export function createClinicCase(input: CreateCaseInput) {
  return unwrap<LabCaseSummary>(
    clinicLabCasesControllerCreate({ body: input as never }),
  );
}

export function transitionClinicCase(
  id: string,
  status: DentalLabCaseStatus,
  reason?: string,
) {
  return unwrap<LabCaseSummary>(
    clinicLabCasesControllerTransition({
      path: { id },
      body: { status, reason } as never,
    }),
  );
}

// ── Files (works for both sides; routing differs) ──────────

export interface PresignResponse {
  fileId: string;
  s3Key: string;
  uploadUrl: string;
  expiresInSec: number;
  headers: Record<string, string>;
}

export function presignClinicCaseFile(
  caseId: string,
  input: { filename: string; mimeType: string; sizeBytes: number },
) {
  return unwrap<PresignResponse>(
    clinicLabCasesControllerPresignFile({
      path: { id: caseId },
      body: input as never,
    }),
  );
}

export function confirmClinicCaseFile(caseId: string, fileId: string) {
  return unwrap<DentalLabCaseFile>(
    clinicLabCasesControllerConfirmFile({
      path: { id: caseId, fileId },
    }),
  );
}

export function presignLabCaseFile(
  caseId: string,
  input: { filename: string; mimeType: string; sizeBytes: number },
) {
  return unwrap<PresignResponse>(
    dentalLabCasesControllerPresignFile({
      path: { id: caseId },
      body: input as never,
    }),
  );
}

export function confirmLabCaseFile(caseId: string, fileId: string) {
  return unwrap<DentalLabCaseFile>(
    dentalLabCasesControllerConfirmFile({
      path: { id: caseId, fileId },
    }),
  );
}

/** Upload a file to S3 via the presigned URL returned by the api. */
export async function putToS3(
  presign: PresignResponse,
  file: File | Blob,
): Promise<void> {
  const res = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: presign.headers,
    body: file,
  });
  if (!res.ok) {
    throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`);
  }
}

// ── Invoices ────────────────────────────────────────────────

export type DentalLabInvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID';

export type DentalLabPaymentLinkProvider =
  | 'PAYMONGO'
  | 'GCASH'
  | 'MAYA'
  | 'STRIPE'
  | 'MANUAL';

export type DentalLabPaymentLinkStatus =
  | 'PENDING'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED';

export interface DentalLabInvoiceItem {
  id: string;
  invoiceId: string;
  caseId: string | null;
  description: string;
  qty: number;
  unitPriceCents: number;
  amountCents: number;
  sortOrder: number;
}

export interface DentalLabPaymentLink {
  id: string;
  invoiceId: string;
  provider: DentalLabPaymentLinkProvider;
  externalId: string | null;
  url: string | null;
  amountCents: number;
  status: DentalLabPaymentLinkStatus;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface LabInvoiceSummary {
  id: string;
  refNumber: number | null;
  labTenantId: string;
  clinicTenantId: string;
  status: DentalLabInvoiceStatus;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lab?: { id: string; slug: string; name: string };
  clinic?: { id: string; slug: string; name: string };
  _count?: { items: number; paymentLinks?: number };
}

export interface LabInvoiceDetail extends LabInvoiceSummary {
  items: DentalLabInvoiceItem[];
  paymentLinks: DentalLabPaymentLink[];
}

export interface InvoiceItemInput {
  caseId?: string;
  description: string;
  qty?: number;
  unitPriceCents: number;
  sortOrder?: number;
}

export interface CreateInvoiceInput {
  clinicTenantId: string;
  currency?: string;
  dueAt?: string;
  notes?: string;
  taxCents?: number;
  items?: InvoiceItemInput[];
}

export interface GenerateFromCasesInput {
  clinicTenantId: string;
  caseIds: string[];
  currency?: string;
  dueAt?: string;
  notes?: string;
  taxCents?: number;
}

export interface InvoiceFilter {
  status?: DentalLabInvoiceStatus;
  clinicTenantId?: string;
}

function invoiceQuery(filter: InvoiceFilter): {
  status?: DentalLabInvoiceStatus;
  clinicTenantId?: string;
} {
  const query: { status?: DentalLabInvoiceStatus; clinicTenantId?: string } =
    {};
  if (filter.status) query.status = filter.status;
  if (filter.clinicTenantId) query.clinicTenantId = filter.clinicTenantId;
  return query;
}

export function listLabInvoices(filter: InvoiceFilter = {}) {
  return unwrap<LabInvoiceSummary[]>(
    dentalLabInvoicesControllerList({ query: invoiceQuery(filter) as never }),
  );
}

export function getLabInvoice(id: string) {
  return unwrap<LabInvoiceDetail>(
    dentalLabInvoicesControllerFindOne({ path: { id } }),
  );
}

export function createLabInvoice(input: CreateInvoiceInput) {
  return unwrap<LabInvoiceDetail>(
    dentalLabInvoicesControllerCreate({ body: input as never }),
  );
}

export function generateInvoiceFromCases(input: GenerateFromCasesInput) {
  return unwrap<LabInvoiceDetail>(
    dentalLabInvoicesControllerGenerate({ body: input as never }),
  );
}

export function updateLabInvoice(
  id: string,
  input: { dueAt?: string | null; notes?: string | null; taxCents?: number },
) {
  return unwrap<LabInvoiceDetail>(
    dentalLabInvoicesControllerUpdate({
      path: { id },
      body: input as never,
    }),
  );
}

export function addLabInvoiceItem(id: string, input: InvoiceItemInput) {
  return unwrap<DentalLabInvoiceItem>(
    dentalLabInvoicesControllerAddItem({
      path: { id },
      body: input as never,
    }),
  );
}

export function updateLabInvoiceItem(
  id: string,
  itemId: string,
  input: Partial<InvoiceItemInput>,
) {
  return unwrap<DentalLabInvoiceItem>(
    dentalLabInvoicesControllerUpdateItem({
      path: { id, itemId },
      body: input as never,
    }),
  );
}

export function deleteLabInvoiceItem(id: string, itemId: string) {
  return unwrap<void>(
    dentalLabInvoicesControllerDeleteItem({ path: { id, itemId } }),
  );
}

export function issueLabInvoice(id: string) {
  return unwrap<LabInvoiceDetail>(
    dentalLabInvoicesControllerIssue({ path: { id } }),
  );
}

export function recordLabInvoicePayment(
  id: string,
  input: { amountCents: number; paidAt?: string; reference?: string },
) {
  return unwrap<LabInvoiceDetail>(
    dentalLabInvoicesControllerRecordPayment({
      path: { id },
      body: input as never,
    }),
  );
}

export function voidLabInvoice(id: string) {
  return unwrap<LabInvoiceDetail>(
    dentalLabInvoicesControllerVoidInvoice({ path: { id } }),
  );
}

export function createLabPaymentLink(
  id: string,
  input: {
    provider?: DentalLabPaymentLinkProvider;
    amountCents?: number;
    externalId?: string;
    url?: string;
    expiresAt?: string;
  },
) {
  return unwrap<DentalLabPaymentLink>(
    dentalLabInvoicesControllerCreatePaymentLink({
      path: { id },
      body: input as never,
    }),
  );
}

export function cancelLabPaymentLink(id: string, linkId: string) {
  return unwrap<DentalLabPaymentLink>(
    dentalLabInvoicesControllerCancelPaymentLink({ path: { id, linkId } }),
  );
}

export function listClinicInvoices(filter: InvoiceFilter = {}) {
  return unwrap<LabInvoiceSummary[]>(
    clinicLabInvoicesControllerList({ query: invoiceQuery(filter) as never }),
  );
}

export function getClinicInvoice(id: string) {
  return unwrap<LabInvoiceDetail>(
    clinicLabInvoicesControllerFindOne({ path: { id } }),
  );
}

export interface PdfDownload {
  url: string;
  expiresInSec: number;
  filename: string;
}

export function generateLabInvoicePdf(id: string) {
  return unwrap<PdfDownload>(
    dentalLabInvoicesControllerGeneratePdf({ path: { id } }),
  );
}

export function getClinicInvoicePdf(id: string) {
  return unwrap<PdfDownload>(
    clinicLabInvoicesControllerGetPdf({ path: { id } }),
  );
}

export function renderConformityPdf(caseId: string, templateId?: string) {
  const query: { templateId?: string } = {};
  if (templateId) query.templateId = templateId;
  return unwrap<PdfDownload>(
    dentalLabComplianceControllerRenderConformityPdf({
      path: { caseId },
      query: query as never,
    }),
  );
}

export interface MonthlySweepResult {
  period: string;
  invoicesCreated: number;
  invoices: Array<{ id: string; clinicTenantId: string; totalCents: number }>;
}

export function runMonthlyInvoiceSweep(period?: string) {
  const query: { period?: string } = {};
  if (period) query.period = period;
  return unwrap<MonthlySweepResult>(
    dentalLabInvoicesControllerSweep({ query: query as never }),
  );
}

// ── Stats ───────────────────────────────────────────────────

export interface LabStatsOverview {
  casesByStatus: Record<DentalLabCaseStatus, number>;
  openCases: number;
  outstandingCents: number;
  casesByMonth: Array<{ month: string; count: number }>;
  revenueByMonth: Array<{ month: string; cents: number }>;
  topClinics: Array<{
    clinicId: string;
    name: string;
    revenueCents: number;
    cases: number;
  }>;
}

export function getLabStats() {
  return unwrap<LabStatsOverview>(dentalLabStatsControllerOverview({}));
}

// ── Treatment plans ────────────────────────────────────────

export type DentalLabTreatmentPlanStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED';

export type DentalLabTreatmentPlanFileKind =
  | 'STL'
  | 'IMAGE'
  | 'REPORT'
  | 'IPR_TABLE'
  | 'OTHER';

export type DentalLabTreatmentPlanDecision =
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED';

export interface DentalLabTreatmentPlanFile {
  id: string;
  planId: string;
  s3Key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: DentalLabTreatmentPlanFileKind;
  createdAt: string;
}

export interface DentalLabTreatmentPlanApproval {
  id: string;
  planId: string;
  decision: DentalLabTreatmentPlanDecision;
  decidedByUserId: string;
  notes: string | null;
  summarySnapshot: string;
  decidedAt: string;
}

export interface DentalLabTreatmentPlan {
  id: string;
  caseId: string;
  labTenantId: string;
  clinicTenantId: string;
  revision: number | null;
  title: string;
  summary: string;
  status: DentalLabTreatmentPlanStatus;
  proposedAt: string | null;
  decidedAt: string | null;
  decidedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  files: DentalLabTreatmentPlanFile[];
  approvals: DentalLabTreatmentPlanApproval[];
}

export function listLabTreatmentPlans(caseId: string) {
  return unwrap<DentalLabTreatmentPlan[]>(
    dentalLabTreatmentPlansControllerList({ query: { caseId } }),
  );
}

export function listClinicTreatmentPlans(caseId: string) {
  return unwrap<DentalLabTreatmentPlan[]>(
    clinicLabTreatmentPlansControllerList({ query: { caseId } }),
  );
}

export function getLabTreatmentPlan(id: string) {
  return unwrap<DentalLabTreatmentPlan>(
    dentalLabTreatmentPlansControllerFindOne({ path: { id } }),
  );
}

export function getClinicTreatmentPlan(id: string) {
  return unwrap<DentalLabTreatmentPlan>(
    clinicLabTreatmentPlansControllerFindOne({ path: { id } }),
  );
}

export function createLabTreatmentPlan(input: {
  caseId: string;
  title: string;
  summary: string;
}) {
  return unwrap<DentalLabTreatmentPlan>(
    dentalLabTreatmentPlansControllerCreate({ body: input as never }),
  );
}

export function updateLabTreatmentPlan(
  id: string,
  input: { title?: string; summary?: string },
) {
  return unwrap<DentalLabTreatmentPlan>(
    dentalLabTreatmentPlansControllerUpdate({
      path: { id },
      body: input as never,
    }),
  );
}

export function proposeLabTreatmentPlan(id: string) {
  return unwrap<DentalLabTreatmentPlan>(
    dentalLabTreatmentPlansControllerPropose({ path: { id } }),
  );
}

export function presignLabTreatmentPlanFile(
  id: string,
  input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    kind?: DentalLabTreatmentPlanFileKind;
  },
) {
  return unwrap<PresignResponse>(
    dentalLabTreatmentPlansControllerPresignFile({
      path: { id },
      body: input as never,
    }),
  );
}

export function deleteLabTreatmentPlanFile(id: string, fileId: string) {
  return unwrap<void>(
    dentalLabTreatmentPlansControllerDeleteFile({ path: { id, fileId } }),
  );
}

export function decideTreatmentPlan(
  id: string,
  input: { decision: DentalLabTreatmentPlanDecision; notes?: string },
) {
  return unwrap<DentalLabTreatmentPlan>(
    clinicLabTreatmentPlansControllerDecide({
      path: { id },
      body: input as never,
    }),
  );
}

export function draftLabTreatmentPlanSummary(caseId: string) {
  return unwrap<{ summary: string }>(
    dentalLabTreatmentPlansControllerDraftSummary({ query: { caseId } }),
  );
}

// ── Disputes ───────────────────────────────────────────────

export type DentalLabCaseDisputeStatus =
  | 'OPEN'
  | 'RESOLVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type DentalLabCaseDisputeKind =
  | 'QUALITY'
  | 'BILLING'
  | 'DELIVERY'
  | 'OTHER';

export interface DentalLabCaseDisputeMessage {
  id: string;
  disputeId: string;
  senderUserId: string;
  senderTenantId: string;
  body: string;
  createdAt: string;
}

export interface DentalLabCaseDispute {
  id: string;
  caseId: string;
  labTenantId: string;
  clinicTenantId: string;
  openedByUserId: string;
  openedByTenantId: string;
  kind: DentalLabCaseDisputeKind;
  reason: string;
  status: DentalLabCaseDisputeStatus;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  messages: DentalLabCaseDisputeMessage[];
}

export function listLabDisputes(side: 'lab' | 'clinic', caseId: string) {
  if (side === 'lab') {
    return unwrap<DentalLabCaseDispute[]>(
      dentalLabDisputesControllerList({ query: { caseId } }),
    );
  }
  return unwrap<DentalLabCaseDispute[]>(
    clinicLabDisputesControllerList({ query: { caseId } }),
  );
}

export function openLabDispute(
  side: 'lab' | 'clinic',
  input: { caseId: string; kind: DentalLabCaseDisputeKind; reason: string },
) {
  if (side === 'lab') {
    return unwrap<DentalLabCaseDispute>(
      dentalLabDisputesControllerOpen({ body: input as never }),
    );
  }
  return unwrap<DentalLabCaseDispute>(
    clinicLabDisputesControllerOpen({ body: input as never }),
  );
}

export function postLabDisputeMessage(
  side: 'lab' | 'clinic',
  id: string,
  body: string,
) {
  if (side === 'lab') {
    return unwrap<DentalLabCaseDisputeMessage>(
      dentalLabDisputesControllerPostMessage({
        path: { id },
        body: { body } as never,
      }),
    );
  }
  return unwrap<DentalLabCaseDisputeMessage>(
    clinicLabDisputesControllerPostMessage({
      path: { id },
      body: { body } as never,
    }),
  );
}

export function closeLabDispute(
  side: 'lab' | 'clinic',
  id: string,
  input: {
    status: 'RESOLVED' | 'REJECTED' | 'WITHDRAWN';
    notes?: string;
  },
) {
  if (side === 'lab') {
    return unwrap<DentalLabCaseDispute>(
      dentalLabDisputesControllerClose({
        path: { id },
        body: input as never,
      }),
    );
  }
  return unwrap<DentalLabCaseDispute>(
    clinicLabDisputesControllerClose({
      path: { id },
      body: input as never,
    }),
  );
}
