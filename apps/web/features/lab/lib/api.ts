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
  labCasesControllerAdvancePhase,
  labCasesControllerConfirmFile,
  labCasesControllerCreateMessage,
  labCasesControllerCreateNote,
  labCasesControllerDeleteNote,
  labCasesControllerFindOne,
  labCasesControllerGetShipment,
  labCasesControllerList,
  labCasesControllerListMessages,
  labCasesControllerListNotes,
  labCasesControllerListPhases,
  labCasesControllerMarkDelivered,
  labCasesControllerPresignFile,
  labCasesControllerTransition,
  labCasesControllerUpdate,
  labCasesControllerUpdateNote,
  labCasesControllerUpsertShipment,
  labClinicLinksControllerInvite,
  labClinicLinksControllerList,
  labClinicLinksControllerRevoke,
  labComplianceControllerCaptureFromClinic,
  labComplianceControllerCreateConformity,
  labComplianceControllerCreateConsent,
  labComplianceControllerListConformity,
  labComplianceControllerListConsentClinic,
  labComplianceControllerListConsentLab,
  labComplianceControllerListSignaturesClinic,
  labComplianceControllerListSignaturesLab,
  labComplianceControllerRemoveConformity,
  labComplianceControllerRemoveConsent,
  labComplianceControllerRenderConformityPdf,
  labDisputesControllerClose,
  labDisputesControllerList,
  labDisputesControllerOpen,
  labDisputesControllerPostMessage,
  labInvoicesControllerAddItem,
  labInvoicesControllerCancelPaymentLink,
  labInvoicesControllerCreate,
  labInvoicesControllerCreatePaymentLink,
  labInvoicesControllerDeleteItem,
  labInvoicesControllerFindOne,
  labInvoicesControllerGenerate,
  labInvoicesControllerGeneratePdf,
  labInvoicesControllerIssue,
  labInvoicesControllerList,
  labInvoicesControllerRecordPayment,
  labInvoicesControllerSweep,
  labInvoicesControllerUpdate,
  labInvoicesControllerUpdateItem,
  labInvoicesControllerVoidInvoice,
  labMaterialsControllerCreate,
  labMaterialsControllerCreateLot,
  labMaterialsControllerDeleteUsage,
  labMaterialsControllerList,
  labMaterialsControllerListLots,
  labMaterialsControllerListUsages,
  labMaterialsControllerRecordUsage,
  labMaterialsControllerRemove,
  labMaterialsControllerUpdateLot,
  labProductsControllerCloneProduct,
  labProductsControllerCreateCategory,
  labProductsControllerCreateProduct,
  labProductsControllerListCategories,
  labProductsControllerListProducts,
  labProductsControllerUpdateProduct,
  labStatsControllerOverview,
  labTagsControllerAssign,
  labTagsControllerCreate,
  labTagsControllerList,
  labTagsControllerListForCase,
  labTagsControllerRemove,
  labTagsControllerUnassign,
  labTreatmentPlansControllerCreate,
  labTreatmentPlansControllerDeleteFile,
  labTreatmentPlansControllerDraftSummary,
  labTreatmentPlansControllerFindOne,
  labTreatmentPlansControllerList,
  labTreatmentPlansControllerPresignFile,
  labTreatmentPlansControllerPropose,
  labTreatmentPlansControllerUpdate,
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

export type LabClinicLinkStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'REJECTED'
  | 'REVOKED'
  | 'SUSPENDED';

export type LabCaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'AWAITING_PICKUP'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REJECTED';

export type LabCaseUrgency = 'STANDARD' | 'URGENT';

export type LabProductPricingMode =
  | 'FIXED'
  | 'PER_RATE_PROFILE'
  | 'ADJUST_ON_ORDER'
  | 'VARIABLE_PER_TIER';

export interface LabClinicLinkSummary {
  id: string;
  labTenantId: string;
  clinicTenantId: string;
  status: LabClinicLinkStatus;
  invitedAt: string;
  respondedAt: string | null;
  inviteNote: string | null;
  lab?: { id: string; slug: string; name: string; labSpecialty: string | null };
  clinic?: { id: string; slug: string; name: string; type: string };
}

export interface LabProductCategory {
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
  pricingMode: LabProductPricingMode;
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
  status: LabCaseStatus;
  urgency: LabCaseUrgency;
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

export interface LabCaseFile {
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
  files: LabCaseFile[];
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
    labClinicLinksControllerInvite({ body: input as never }),
  );
}

export function listLabClinicLinks() {
  return unwrap<LabClinicLinkSummary[]>(labClinicLinksControllerList({}));
}

export function revokeLabInvitation(id: string) {
  return unwrap<LabClinicLinkSummary>(
    labClinicLinksControllerRevoke({ path: { id } }),
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
  return unwrap<LabProductCategory[]>(labProductsControllerListCategories({}));
}

export function createCategory(input: {
  name: string;
  description?: string;
  parentId?: string;
}) {
  return unwrap<LabProductCategory>(
    labProductsControllerCreateCategory({ body: input as never }),
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
    labProductsControllerListProducts({ query: query as never }),
  );
}

export interface CreateProductInput {
  name: string;
  description?: string;
  sku?: string;
  categoryId?: string;
  defaultPrice?: number; // centavos
  currency?: string;
  pricingMode?: LabProductPricingMode;
  phases?: string[];
  tags?: string[];
  formSchema?: Record<string, unknown>;
}

export function createProduct(input: CreateProductInput) {
  return unwrap<LabProductSummary>(
    labProductsControllerCreateProduct({ body: input as never }),
  );
}

export function updateProduct(
  id: string,
  input: Partial<CreateProductInput> & { isActive?: boolean },
) {
  return unwrap<LabProductSummary>(
    labProductsControllerUpdateProduct({ path: { id }, body: input as never }),
  );
}

export function cloneProduct(id: string) {
  return unwrap<LabProductSummary>(
    labProductsControllerCloneProduct({ path: { id } }),
  );
}

// ── Cases (lab side) ─────────────────────────────────────────

export function listLabCases(opts?: {
  status?: LabCaseStatus;
  tagId?: string;
}) {
  const query: { status?: LabCaseStatus; tagId?: string } = {};
  if (opts?.status) query.status = opts.status;
  if (opts?.tagId) query.tagId = opts.tagId;
  return unwrap<LabCaseSummary[]>(
    labCasesControllerList({ query: query as never }),
  );
}

export function getLabCase(id: string) {
  return unwrap<LabCaseDetail>(labCasesControllerFindOne({ path: { id } }));
}

export function transitionLabCase(
  id: string,
  status: LabCaseStatus,
  reason?: string,
) {
  return unwrap<LabCaseSummary>(
    labCasesControllerTransition({
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
    labCasesControllerUpdate({ path: { id }, body: input as never }),
  );
}

// ── Phases ──────────────────────────────────────────────────

export interface LabCasePhaseEvent {
  id: string;
  caseId: string;
  phase: string;
  enteredAt: string;
  enteredByUserId: string;
  exitedAt: string | null;
  notes: string | null;
}

export function listLabCasePhases(caseId: string) {
  return unwrap<LabCasePhaseEvent[]>(
    labCasesControllerListPhases({ path: { id: caseId } }),
  );
}

export function listClinicCasePhases(caseId: string) {
  return unwrap<LabCasePhaseEvent[]>(
    clinicLabCasesControllerListPhases({ path: { id: caseId } }),
  );
}

export function advanceLabCasePhase(
  caseId: string,
  input: { phase?: string; notes?: string },
) {
  return unwrap<LabCasePhaseEvent>(
    labCasesControllerAdvancePhase({
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

export interface LabConsentSignature {
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
    labComplianceControllerListConformity({}),
  );
}
export function createConformityTemplate(input: {
  name: string;
  body: string;
  productId?: string;
  isDefault?: boolean;
}) {
  return unwrap<LabComplianceTemplate>(
    labComplianceControllerCreateConformity({ body: input as never }),
  );
}
export function deleteConformityTemplate(id: string) {
  return unwrap<void>(
    labComplianceControllerRemoveConformity({ path: { id } }),
  );
}

export function listLabConsentTemplates() {
  return unwrap<LabComplianceTemplate[]>(
    labComplianceControllerListConsentLab({}),
  );
}
export function listClinicConsentTemplates() {
  return unwrap<LabComplianceTemplate[]>(
    labComplianceControllerListConsentClinic({}),
  );
}
export function createConsentTemplate(input: {
  name: string;
  body: string;
  productId?: string;
  isDefault?: boolean;
}) {
  return unwrap<LabComplianceTemplate>(
    labComplianceControllerCreateConsent({ body: input as never }),
  );
}
export function deleteConsentTemplate(id: string) {
  return unwrap<void>(labComplianceControllerRemoveConsent({ path: { id } }));
}

export function listLabCaseSignatures(caseId: string) {
  return unwrap<LabConsentSignature[]>(
    labComplianceControllerListSignaturesLab({ path: { caseId } }),
  );
}
export function listClinicCaseSignatures(caseId: string) {
  return unwrap<LabConsentSignature[]>(
    labComplianceControllerListSignaturesClinic({ path: { caseId } }),
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
  return unwrap<LabConsentSignature>(
    labComplianceControllerCaptureFromClinic({
      path: { caseId },
      body: input as never,
    }),
  );
}

// ── Materials + LOTs ────────────────────────────────────────

export type LabMaterialLotStatus =
  | 'ACTIVE'
  | 'WAREHOUSE'
  | 'FINISHED'
  | 'DEFECTIVE'
  | 'EXPIRED';

export interface LabMaterial {
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
    status: LabMaterialLotStatus;
    remainingQty: number;
  }>;
}

export interface LabMaterialLot {
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
  status: LabMaterialLotStatus;
  notes: string | null;
}

export interface LabMaterialUsage {
  id: string;
  caseId: string;
  lotId: string;
  qty: number;
  usedAt: string;
  usedByUserId: string;
  lot?: LabMaterialLot & { material: LabMaterial };
}

export function listMaterials() {
  return unwrap<LabMaterial[]>(labMaterialsControllerList({}));
}

export function createMaterial(input: {
  name: string;
  sku?: string;
  category?: string;
  unitOfMeasure?: string;
  description?: string;
  defaultSupplier?: string;
}) {
  return unwrap<LabMaterial>(
    labMaterialsControllerCreate({ body: input as never }),
  );
}

export function deleteMaterial(id: string) {
  return unwrap<void>(labMaterialsControllerRemove({ path: { id } }));
}

export function listMaterialLots(materialId: string) {
  return unwrap<LabMaterialLot[]>(
    labMaterialsControllerListLots({ path: { id: materialId } }),
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
  return unwrap<LabMaterialLot>(
    labMaterialsControllerCreateLot({
      path: { id: materialId },
      body: input as never,
    }),
  );
}

export function updateMaterialLot(
  lotId: string,
  input: {
    status?: LabMaterialLotStatus;
    expiresAt?: string | null;
    notes?: string | null;
  },
) {
  return unwrap<LabMaterialLot>(
    labMaterialsControllerUpdateLot({
      path: { lotId },
      body: input as never,
    }),
  );
}

export function listCaseMaterialUsages(caseId: string) {
  return unwrap<LabMaterialUsage[]>(
    labMaterialsControllerListUsages({ path: { caseId } }),
  );
}

export function recordCaseMaterialUsage(
  caseId: string,
  input: { lotId: string; qty: number },
) {
  return unwrap<LabMaterialUsage>(
    labMaterialsControllerRecordUsage({
      path: { caseId },
      body: input as never,
    }),
  );
}

export function deleteCaseMaterialUsage(caseId: string, usageId: string) {
  return unwrap<void>(
    labMaterialsControllerDeleteUsage({
      path: { caseId, usageId },
    }),
  );
}

// ── Shipments ───────────────────────────────────────────────

export interface LabShipment {
  id: string;
  caseId: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string;
  deliveredAt: string | null;
  notes: string | null;
}

export function getLabCaseShipment(caseId: string) {
  return unwrap<LabShipment | null>(
    labCasesControllerGetShipment({ path: { id: caseId } }),
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
  return unwrap<LabShipment>(
    labCasesControllerUpsertShipment({
      path: { id: caseId },
      body: input as never,
    }),
  );
}

export function markLabCaseDelivered(caseId: string) {
  return unwrap<LabShipment>(
    labCasesControllerMarkDelivered({ path: { id: caseId } }),
  );
}

export function getClinicCaseShipment(caseId: string) {
  return unwrap<LabShipment | null>(
    clinicLabCasesControllerGetShipment({ path: { id: caseId } }),
  );
}

export function markClinicCaseDelivered(caseId: string) {
  return unwrap<LabShipment>(
    clinicLabCasesControllerMarkDelivered({ path: { id: caseId } }),
  );
}

// ── Tags (lab-only) ─────────────────────────────────────────

export interface LabCaseTag {
  id: string;
  tenantId: string;
  name: string;
  color: string;
}

export function listLabTags() {
  return unwrap<LabCaseTag[]>(labTagsControllerList({}));
}

export function createLabTag(input: { name: string; color?: string }) {
  return unwrap<LabCaseTag>(labTagsControllerCreate({ body: input as never }));
}

export function deleteLabTag(id: string) {
  return unwrap<void>(labTagsControllerRemove({ path: { id } }));
}

export function listCaseTags(caseId: string) {
  return unwrap<LabCaseTag[]>(
    labTagsControllerListForCase({ path: { caseId } }),
  );
}

export function assignCaseTag(caseId: string, tagId: string) {
  return unwrap<unknown>(
    labTagsControllerAssign({
      path: { caseId },
      body: { tagId } as never,
    }),
  );
}

export function unassignCaseTag(caseId: string, tagId: string) {
  return unwrap<void>(labTagsControllerUnassign({ path: { caseId, tagId } }));
}

// ── Notes (lab-only) ────────────────────────────────────────

export interface LabCaseNote {
  id: string;
  caseId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export function listLabCaseNotes(caseId: string) {
  return unwrap<LabCaseNote[]>(
    labCasesControllerListNotes({ path: { id: caseId } }),
  );
}

export function createLabCaseNote(caseId: string, body: string) {
  return unwrap<LabCaseNote>(
    labCasesControllerCreateNote({
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
  return unwrap<LabCaseNote>(
    labCasesControllerUpdateNote({
      path: { id: caseId, noteId },
      body: { body } as never,
    }),
  );
}

export function deleteLabCaseNote(caseId: string, noteId: string) {
  return unwrap<void>(
    labCasesControllerDeleteNote({ path: { id: caseId, noteId } }),
  );
}

// ── Messages (chat — both sides) ────────────────────────────

export interface LabCaseMessage {
  id: string;
  caseId: string;
  senderUserId: string;
  senderTenantId: string;
  body: string;
  createdAt: string;
}

export function listLabCaseMessages(caseId: string) {
  return unwrap<LabCaseMessage[]>(
    labCasesControllerListMessages({ path: { id: caseId } }),
  );
}

export function createLabCaseMessage(caseId: string, body: string) {
  return unwrap<LabCaseMessage>(
    labCasesControllerCreateMessage({
      path: { id: caseId },
      body: { body } as never,
    }),
  );
}

export function listClinicCaseMessages(caseId: string) {
  return unwrap<LabCaseMessage[]>(
    clinicLabCasesControllerListMessages({ path: { id: caseId } }),
  );
}

export function createClinicCaseMessage(caseId: string, body: string) {
  return unwrap<LabCaseMessage>(
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
  urgency?: LabCaseUrgency;
  dueAt?: string; // ISO
  formData?: Record<string, unknown>;
  patientLabel?: string;
  doctorLabel?: string;
  deliveryCenter?: string;
  notes?: string;
}

export function listClinicCases(opts?: { status?: LabCaseStatus }) {
  const query: { status?: LabCaseStatus } = {};
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
  status: LabCaseStatus,
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
  return unwrap<LabCaseFile>(
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
    labCasesControllerPresignFile({
      path: { id: caseId },
      body: input as never,
    }),
  );
}

export function confirmLabCaseFile(caseId: string, fileId: string) {
  return unwrap<LabCaseFile>(
    labCasesControllerConfirmFile({
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

export type LabInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'VOID';

export type LabPaymentLinkProvider =
  | 'PAYMONGO'
  | 'GCASH'
  | 'MAYA'
  | 'STRIPE'
  | 'MANUAL';

export type LabPaymentLinkStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export interface LabInvoiceItem {
  id: string;
  invoiceId: string;
  caseId: string | null;
  description: string;
  qty: number;
  unitPriceCents: number;
  amountCents: number;
  sortOrder: number;
}

export interface LabPaymentLink {
  id: string;
  invoiceId: string;
  provider: LabPaymentLinkProvider;
  externalId: string | null;
  url: string | null;
  amountCents: number;
  status: LabPaymentLinkStatus;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface LabInvoiceSummary {
  id: string;
  refNumber: number | null;
  labTenantId: string;
  clinicTenantId: string;
  status: LabInvoiceStatus;
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
  items: LabInvoiceItem[];
  paymentLinks: LabPaymentLink[];
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
  status?: LabInvoiceStatus;
  clinicTenantId?: string;
}

function invoiceQuery(filter: InvoiceFilter): {
  status?: LabInvoiceStatus;
  clinicTenantId?: string;
} {
  const query: { status?: LabInvoiceStatus; clinicTenantId?: string } = {};
  if (filter.status) query.status = filter.status;
  if (filter.clinicTenantId) query.clinicTenantId = filter.clinicTenantId;
  return query;
}

export function listLabInvoices(filter: InvoiceFilter = {}) {
  return unwrap<LabInvoiceSummary[]>(
    labInvoicesControllerList({ query: invoiceQuery(filter) as never }),
  );
}

export function getLabInvoice(id: string) {
  return unwrap<LabInvoiceDetail>(
    labInvoicesControllerFindOne({ path: { id } }),
  );
}

export function createLabInvoice(input: CreateInvoiceInput) {
  return unwrap<LabInvoiceDetail>(
    labInvoicesControllerCreate({ body: input as never }),
  );
}

export function generateInvoiceFromCases(input: GenerateFromCasesInput) {
  return unwrap<LabInvoiceDetail>(
    labInvoicesControllerGenerate({ body: input as never }),
  );
}

export function updateLabInvoice(
  id: string,
  input: { dueAt?: string | null; notes?: string | null; taxCents?: number },
) {
  return unwrap<LabInvoiceDetail>(
    labInvoicesControllerUpdate({
      path: { id },
      body: input as never,
    }),
  );
}

export function addLabInvoiceItem(id: string, input: InvoiceItemInput) {
  return unwrap<LabInvoiceItem>(
    labInvoicesControllerAddItem({
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
  return unwrap<LabInvoiceItem>(
    labInvoicesControllerUpdateItem({
      path: { id, itemId },
      body: input as never,
    }),
  );
}

export function deleteLabInvoiceItem(id: string, itemId: string) {
  return unwrap<void>(
    labInvoicesControllerDeleteItem({ path: { id, itemId } }),
  );
}

export function issueLabInvoice(id: string) {
  return unwrap<LabInvoiceDetail>(labInvoicesControllerIssue({ path: { id } }));
}

export function recordLabInvoicePayment(
  id: string,
  input: { amountCents: number; paidAt?: string; reference?: string },
) {
  return unwrap<LabInvoiceDetail>(
    labInvoicesControllerRecordPayment({
      path: { id },
      body: input as never,
    }),
  );
}

export function voidLabInvoice(id: string) {
  return unwrap<LabInvoiceDetail>(
    labInvoicesControllerVoidInvoice({ path: { id } }),
  );
}

export function createLabPaymentLink(
  id: string,
  input: {
    provider?: LabPaymentLinkProvider;
    amountCents?: number;
    externalId?: string;
    url?: string;
    expiresAt?: string;
  },
) {
  return unwrap<LabPaymentLink>(
    labInvoicesControllerCreatePaymentLink({
      path: { id },
      body: input as never,
    }),
  );
}

export function cancelLabPaymentLink(id: string, linkId: string) {
  return unwrap<LabPaymentLink>(
    labInvoicesControllerCancelPaymentLink({ path: { id, linkId } }),
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
    labInvoicesControllerGeneratePdf({ path: { id } }),
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
    labComplianceControllerRenderConformityPdf({
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
    labInvoicesControllerSweep({ query: query as never }),
  );
}

// ── Stats ───────────────────────────────────────────────────

export interface LabStatsOverview {
  casesByStatus: Record<LabCaseStatus, number>;
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
  return unwrap<LabStatsOverview>(labStatsControllerOverview({}));
}

// ── Treatment plans ────────────────────────────────────────

export type LabTreatmentPlanStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED';

export type LabTreatmentPlanFileKind =
  | 'STL'
  | 'IMAGE'
  | 'REPORT'
  | 'IPR_TABLE'
  | 'OTHER';

export type LabTreatmentPlanDecision =
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED';

export interface LabTreatmentPlanFile {
  id: string;
  planId: string;
  s3Key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: LabTreatmentPlanFileKind;
  createdAt: string;
}

export interface LabTreatmentPlanApproval {
  id: string;
  planId: string;
  decision: LabTreatmentPlanDecision;
  decidedByUserId: string;
  notes: string | null;
  summarySnapshot: string;
  decidedAt: string;
}

export interface LabTreatmentPlan {
  id: string;
  caseId: string;
  labTenantId: string;
  clinicTenantId: string;
  revision: number | null;
  title: string;
  summary: string;
  status: LabTreatmentPlanStatus;
  proposedAt: string | null;
  decidedAt: string | null;
  decidedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  files: LabTreatmentPlanFile[];
  approvals: LabTreatmentPlanApproval[];
}

export function listLabTreatmentPlans(caseId: string) {
  return unwrap<LabTreatmentPlan[]>(
    labTreatmentPlansControllerList({ query: { caseId } }),
  );
}

export function listClinicTreatmentPlans(caseId: string) {
  return unwrap<LabTreatmentPlan[]>(
    clinicLabTreatmentPlansControllerList({ query: { caseId } }),
  );
}

export function getLabTreatmentPlan(id: string) {
  return unwrap<LabTreatmentPlan>(
    labTreatmentPlansControllerFindOne({ path: { id } }),
  );
}

export function getClinicTreatmentPlan(id: string) {
  return unwrap<LabTreatmentPlan>(
    clinicLabTreatmentPlansControllerFindOne({ path: { id } }),
  );
}

export function createLabTreatmentPlan(input: {
  caseId: string;
  title: string;
  summary: string;
}) {
  return unwrap<LabTreatmentPlan>(
    labTreatmentPlansControllerCreate({ body: input as never }),
  );
}

export function updateLabTreatmentPlan(
  id: string,
  input: { title?: string; summary?: string },
) {
  return unwrap<LabTreatmentPlan>(
    labTreatmentPlansControllerUpdate({
      path: { id },
      body: input as never,
    }),
  );
}

export function proposeLabTreatmentPlan(id: string) {
  return unwrap<LabTreatmentPlan>(
    labTreatmentPlansControllerPropose({ path: { id } }),
  );
}

export function presignLabTreatmentPlanFile(
  id: string,
  input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    kind?: LabTreatmentPlanFileKind;
  },
) {
  return unwrap<PresignResponse>(
    labTreatmentPlansControllerPresignFile({
      path: { id },
      body: input as never,
    }),
  );
}

export function deleteLabTreatmentPlanFile(id: string, fileId: string) {
  return unwrap<void>(
    labTreatmentPlansControllerDeleteFile({ path: { id, fileId } }),
  );
}

export function decideTreatmentPlan(
  id: string,
  input: { decision: LabTreatmentPlanDecision; notes?: string },
) {
  return unwrap<LabTreatmentPlan>(
    clinicLabTreatmentPlansControllerDecide({
      path: { id },
      body: input as never,
    }),
  );
}

export function draftLabTreatmentPlanSummary(caseId: string) {
  return unwrap<{ summary: string }>(
    labTreatmentPlansControllerDraftSummary({ query: { caseId } }),
  );
}

// ── Disputes ───────────────────────────────────────────────

export type LabCaseDisputeStatus =
  | 'OPEN'
  | 'RESOLVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type LabCaseDisputeKind = 'QUALITY' | 'BILLING' | 'DELIVERY' | 'OTHER';

export interface LabCaseDisputeMessage {
  id: string;
  disputeId: string;
  senderUserId: string;
  senderTenantId: string;
  body: string;
  createdAt: string;
}

export interface LabCaseDispute {
  id: string;
  caseId: string;
  labTenantId: string;
  clinicTenantId: string;
  openedByUserId: string;
  openedByTenantId: string;
  kind: LabCaseDisputeKind;
  reason: string;
  status: LabCaseDisputeStatus;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  messages: LabCaseDisputeMessage[];
}

export function listLabDisputes(side: 'lab' | 'clinic', caseId: string) {
  if (side === 'lab') {
    return unwrap<LabCaseDispute[]>(
      labDisputesControllerList({ query: { caseId } }),
    );
  }
  return unwrap<LabCaseDispute[]>(
    clinicLabDisputesControllerList({ query: { caseId } }),
  );
}

export function openLabDispute(
  side: 'lab' | 'clinic',
  input: { caseId: string; kind: LabCaseDisputeKind; reason: string },
) {
  if (side === 'lab') {
    return unwrap<LabCaseDispute>(
      labDisputesControllerOpen({ body: input as never }),
    );
  }
  return unwrap<LabCaseDispute>(
    clinicLabDisputesControllerOpen({ body: input as never }),
  );
}

export function postLabDisputeMessage(
  side: 'lab' | 'clinic',
  id: string,
  body: string,
) {
  if (side === 'lab') {
    return unwrap<LabCaseDisputeMessage>(
      labDisputesControllerPostMessage({
        path: { id },
        body: { body } as never,
      }),
    );
  }
  return unwrap<LabCaseDisputeMessage>(
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
    return unwrap<LabCaseDispute>(
      labDisputesControllerClose({
        path: { id },
        body: input as never,
      }),
    );
  }
  return unwrap<LabCaseDispute>(
    clinicLabDisputesControllerClose({
      path: { id },
      body: input as never,
    }),
  );
}
