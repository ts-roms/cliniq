// Direct fetcher for the Lab module API. Uses the tenant session JWT (same
// session as the rest of the clinic app — labs are tenants too). When the
// typed @org/api-client is regenerated, this can collapse to thin wrappers
// or get replaced entirely.

import { loadSession, clearSession } from '@/features/auth';

const API_BASE =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000';

export class LabApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json');
  }
  if (init.auth !== false) {
    const session = loadSession();
    if (session?.accessToken) {
      headers.set('authorization', `Bearer ${session.accessToken}`);
    }
  }
  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401) clearSession();
    const fromBody =
      body && typeof body === 'object'
        ? (body as { message?: string }).message
        : undefined;
    const message = fromBody ?? `request failed: ${res.status}`;
    throw new LabApiError(res.status, body, message);
  }
  return body as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
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

export function inviteClinic(input: { clinicSlug: string; inviteNote?: string }) {
  return call<LabClinicLinkSummary>('/lab/clinic-links/invite', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLabClinicLinks() {
  return call<LabClinicLinkSummary[]>('/lab/clinic-links');
}

export function revokeLabInvitation(id: string) {
  return call<LabClinicLinkSummary>(`/lab/clinic-links/${id}`, { method: 'DELETE' });
}

// ── Clinic-side: invitations ─────────────────────────────────

export function listClinicInvitations() {
  return call<LabClinicLinkSummary[]>('/clinic/lab-invitations');
}

export function acceptInvitation(id: string) {
  return call<LabClinicLinkSummary>(`/clinic/lab-invitations/${id}/accept`, {
    method: 'POST',
  });
}

export function rejectInvitation(id: string) {
  return call<LabClinicLinkSummary>(`/clinic/lab-invitations/${id}/reject`, {
    method: 'POST',
  });
}

// ── Catalog (lab side) ──────────────────────────────────────

export function listCategories() {
  return call<LabProductCategory[]>('/lab/categories');
}

export function createCategory(input: { name: string; description?: string; parentId?: string }) {
  return call<LabProductCategory>('/lab/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listProducts(opts?: { activeOnly?: boolean; categoryId?: string }) {
  const params = new URLSearchParams();
  if (opts?.activeOnly) params.set('activeOnly', 'true');
  if (opts?.categoryId) params.set('categoryId', opts.categoryId);
  const qs = params.toString();
  return call<LabProductSummary[]>(`/lab/products${qs ? `?${qs}` : ''}`);
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
  return call<LabProductSummary>('/lab/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProduct(id: string, input: Partial<CreateProductInput> & { isActive?: boolean }) {
  return call<LabProductSummary>(`/lab/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function cloneProduct(id: string) {
  return call<LabProductSummary>(`/lab/products/${id}/clone`, { method: 'POST' });
}

// ── Cases (lab side) ─────────────────────────────────────────

export function listLabCases(opts?: { status?: LabCaseStatus; tagId?: string }) {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.tagId) params.set('tagId', opts.tagId);
  const qs = params.toString();
  return call<LabCaseSummary[]>(`/lab/cases${qs ? `?${qs}` : ''}`);
}

export function getLabCase(id: string) {
  return call<LabCaseDetail>(`/lab/cases/${id}`);
}

export function transitionLabCase(id: string, status: LabCaseStatus, reason?: string) {
  return call<LabCaseSummary>(`/lab/cases/${id}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ status, reason }),
  });
}

export function updateLabCaseAsLab(id: string, input: { unitPrice?: number; notes?: string }) {
  return call<LabCaseSummary>(`/lab/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
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
  return call<LabCasePhaseEvent[]>(`/lab/cases/${caseId}/phases`);
}

export function listClinicCasePhases(caseId: string) {
  return call<LabCasePhaseEvent[]>(`/clinic/lab-cases/${caseId}/phases`);
}

export function advanceLabCasePhase(
  caseId: string,
  input: { phase?: string; notes?: string },
) {
  return call<LabCasePhaseEvent>(`/lab/cases/${caseId}/phases/advance`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
  return call<LabComplianceTemplate[]>('/lab/conformity-templates');
}
export function createConformityTemplate(input: {
  name: string;
  body: string;
  productId?: string;
  isDefault?: boolean;
}) {
  return call<LabComplianceTemplate>('/lab/conformity-templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export function deleteConformityTemplate(id: string) {
  return call<void>(`/lab/conformity-templates/${id}`, { method: 'DELETE' });
}

export function listLabConsentTemplates() {
  return call<LabComplianceTemplate[]>('/lab/consent-templates');
}
export function listClinicConsentTemplates() {
  return call<LabComplianceTemplate[]>('/clinic/consent-templates');
}
export function createConsentTemplate(input: {
  name: string;
  body: string;
  productId?: string;
  isDefault?: boolean;
}) {
  return call<LabComplianceTemplate>('/lab/consent-templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export function deleteConsentTemplate(id: string) {
  return call<void>(`/lab/consent-templates/${id}`, { method: 'DELETE' });
}

export function listLabCaseSignatures(caseId: string) {
  return call<LabConsentSignature[]>(`/lab/cases/${caseId}/signatures`);
}
export function listClinicCaseSignatures(caseId: string) {
  return call<LabConsentSignature[]>(`/clinic/lab-cases/${caseId}/signatures`);
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
  return call<LabConsentSignature>(`/clinic/lab-cases/${caseId}/signatures`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
  lots?: Array<{ id: string; status: LabMaterialLotStatus; remainingQty: number }>;
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
  return call<LabMaterial[]>('/lab/materials');
}

export function createMaterial(input: {
  name: string;
  sku?: string;
  category?: string;
  unitOfMeasure?: string;
  description?: string;
  defaultSupplier?: string;
}) {
  return call<LabMaterial>('/lab/materials', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteMaterial(id: string) {
  return call<void>(`/lab/materials/${id}`, { method: 'DELETE' });
}

export function listMaterialLots(materialId: string) {
  return call<LabMaterialLot[]>(`/lab/materials/${materialId}/lots`);
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
  return call<LabMaterialLot>(`/lab/materials/${materialId}/lots`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateMaterialLot(
  lotId: string,
  input: { status?: LabMaterialLotStatus; expiresAt?: string | null; notes?: string | null },
) {
  return call<LabMaterialLot>(`/lab/lots/${lotId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listCaseMaterialUsages(caseId: string) {
  return call<LabMaterialUsage[]>(`/lab/cases/${caseId}/material-usages`);
}

export function recordCaseMaterialUsage(
  caseId: string,
  input: { lotId: string; qty: number },
) {
  return call<LabMaterialUsage>(`/lab/cases/${caseId}/material-usages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteCaseMaterialUsage(caseId: string, usageId: string) {
  return call<void>(`/lab/cases/${caseId}/material-usages/${usageId}`, {
    method: 'DELETE',
  });
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
  return call<LabShipment | null>(`/lab/cases/${caseId}/shipment`);
}

export function upsertLabCaseShipment(
  caseId: string,
  input: { carrier?: string | null; trackingNumber?: string | null; notes?: string | null },
) {
  return call<LabShipment>(`/lab/cases/${caseId}/shipment`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function markLabCaseDelivered(caseId: string) {
  return call<LabShipment>(`/lab/cases/${caseId}/shipment/delivered`, {
    method: 'POST',
  });
}

export function getClinicCaseShipment(caseId: string) {
  return call<LabShipment | null>(`/clinic/lab-cases/${caseId}/shipment`);
}

export function markClinicCaseDelivered(caseId: string) {
  return call<LabShipment>(`/clinic/lab-cases/${caseId}/shipment/delivered`, {
    method: 'POST',
  });
}

// ── Tags (lab-only) ─────────────────────────────────────────

export interface LabCaseTag {
  id: string;
  tenantId: string;
  name: string;
  color: string;
}

export function listLabTags() {
  return call<LabCaseTag[]>('/lab/tags');
}

export function createLabTag(input: { name: string; color?: string }) {
  return call<LabCaseTag>('/lab/tags', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteLabTag(id: string) {
  return call<void>(`/lab/tags/${id}`, { method: 'DELETE' });
}

export function listCaseTags(caseId: string) {
  return call<LabCaseTag[]>(`/lab/cases/${caseId}/tags`);
}

export function assignCaseTag(caseId: string, tagId: string) {
  return call<unknown>(`/lab/cases/${caseId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagId }),
  });
}

export function unassignCaseTag(caseId: string, tagId: string) {
  return call<void>(`/lab/cases/${caseId}/tags/${tagId}`, { method: 'DELETE' });
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
  return call<LabCaseNote[]>(`/lab/cases/${caseId}/notes`);
}

export function createLabCaseNote(caseId: string, body: string) {
  return call<LabCaseNote>(`/lab/cases/${caseId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function updateLabCaseNote(caseId: string, noteId: string, body: string) {
  return call<LabCaseNote>(`/lab/cases/${caseId}/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export function deleteLabCaseNote(caseId: string, noteId: string) {
  return call<void>(`/lab/cases/${caseId}/notes/${noteId}`, { method: 'DELETE' });
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
  return call<LabCaseMessage[]>(`/lab/cases/${caseId}/messages`);
}

export function createLabCaseMessage(caseId: string, body: string) {
  return call<LabCaseMessage>(`/lab/cases/${caseId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function listClinicCaseMessages(caseId: string) {
  return call<LabCaseMessage[]>(`/clinic/lab-cases/${caseId}/messages`);
}

export function createClinicCaseMessage(caseId: string, body: string) {
  return call<LabCaseMessage>(`/clinic/lab-cases/${caseId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
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
  const qs = opts?.status ? `?status=${opts.status}` : '';
  return call<LabCaseSummary[]>(`/clinic/lab-cases${qs}`);
}

export function getClinicCase(id: string) {
  return call<LabCaseDetail>(`/clinic/lab-cases/${id}`);
}

export function createClinicCase(input: CreateCaseInput) {
  return call<LabCaseSummary>('/clinic/lab-cases', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function transitionClinicCase(id: string, status: LabCaseStatus, reason?: string) {
  return call<LabCaseSummary>(`/clinic/lab-cases/${id}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ status, reason }),
  });
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
  return call<PresignResponse>(`/clinic/lab-cases/${caseId}/files/presign`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function confirmClinicCaseFile(caseId: string, fileId: string) {
  return call<LabCaseFile>(`/clinic/lab-cases/${caseId}/files/${fileId}/confirm`, {
    method: 'POST',
  });
}

export function presignLabCaseFile(
  caseId: string,
  input: { filename: string; mimeType: string; sizeBytes: number },
) {
  return call<PresignResponse>(`/lab/cases/${caseId}/files/presign`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function confirmLabCaseFile(caseId: string, fileId: string) {
  return call<LabCaseFile>(`/lab/cases/${caseId}/files/${fileId}/confirm`, {
    method: 'POST',
  });
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

function invoiceQuery(filter: InvoiceFilter): string {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.clinicTenantId) params.set('clinicTenantId', filter.clinicTenantId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listLabInvoices(filter: InvoiceFilter = {}) {
  return call<LabInvoiceSummary[]>(`/lab/invoices${invoiceQuery(filter)}`);
}

export function getLabInvoice(id: string) {
  return call<LabInvoiceDetail>(`/lab/invoices/${id}`);
}

export function createLabInvoice(input: CreateInvoiceInput) {
  return call<LabInvoiceDetail>('/lab/invoices', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function generateInvoiceFromCases(input: GenerateFromCasesInput) {
  return call<LabInvoiceDetail>('/lab/invoices/generate-from-cases', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLabInvoice(
  id: string,
  input: { dueAt?: string | null; notes?: string | null; taxCents?: number },
) {
  return call<LabInvoiceDetail>(`/lab/invoices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function addLabInvoiceItem(id: string, input: InvoiceItemInput) {
  return call<LabInvoiceItem>(`/lab/invoices/${id}/items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLabInvoiceItem(
  id: string,
  itemId: string,
  input: Partial<InvoiceItemInput>,
) {
  return call<LabInvoiceItem>(`/lab/invoices/${id}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteLabInvoiceItem(id: string, itemId: string) {
  return call<void>(`/lab/invoices/${id}/items/${itemId}`, { method: 'DELETE' });
}

export function issueLabInvoice(id: string) {
  return call<LabInvoiceDetail>(`/lab/invoices/${id}/issue`, { method: 'POST' });
}

export function recordLabInvoicePayment(
  id: string,
  input: { amountCents: number; paidAt?: string; reference?: string },
) {
  return call<LabInvoiceDetail>(`/lab/invoices/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidLabInvoice(id: string) {
  return call<LabInvoiceDetail>(`/lab/invoices/${id}/void`, { method: 'POST' });
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
  return call<LabPaymentLink>(`/lab/invoices/${id}/payment-links`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function cancelLabPaymentLink(id: string, linkId: string) {
  return call<LabPaymentLink>(`/lab/invoices/${id}/payment-links/${linkId}`, {
    method: 'DELETE',
  });
}

export function listClinicInvoices(filter: InvoiceFilter = {}) {
  return call<LabInvoiceSummary[]>(`/clinic/lab-invoices${invoiceQuery(filter)}`);
}

export function getClinicInvoice(id: string) {
  return call<LabInvoiceDetail>(`/clinic/lab-invoices/${id}`);
}

export interface PdfDownload {
  url: string;
  expiresInSec: number;
  filename: string;
}

export function generateLabInvoicePdf(id: string) {
  return call<PdfDownload>(`/lab/invoices/${id}/pdf`, { method: 'POST' });
}

export function getClinicInvoicePdf(id: string) {
  return call<PdfDownload>(`/clinic/lab-invoices/${id}/pdf`);
}

export function renderConformityPdf(caseId: string, templateId?: string) {
  const qs = templateId ? `?templateId=${encodeURIComponent(templateId)}` : '';
  return call<PdfDownload>(`/lab/cases/${caseId}/conformity-pdf${qs}`, {
    method: 'POST',
  });
}

export interface MonthlySweepResult {
  period: string;
  invoicesCreated: number;
  invoices: Array<{ id: string; clinicTenantId: string; totalCents: number }>;
}

export function runMonthlyInvoiceSweep(period?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  return call<MonthlySweepResult>(`/lab/invoices/sweep${qs}`, { method: 'POST' });
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
  return call<LabStatsOverview>('/lab/stats');
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
  return call<LabTreatmentPlan[]>(
    `/lab/treatment-plans?caseId=${encodeURIComponent(caseId)}`,
  );
}

export function listClinicTreatmentPlans(caseId: string) {
  return call<LabTreatmentPlan[]>(
    `/clinic/lab-treatment-plans?caseId=${encodeURIComponent(caseId)}`,
  );
}

export function getLabTreatmentPlan(id: string) {
  return call<LabTreatmentPlan>(`/lab/treatment-plans/${id}`);
}

export function getClinicTreatmentPlan(id: string) {
  return call<LabTreatmentPlan>(`/clinic/lab-treatment-plans/${id}`);
}

export function createLabTreatmentPlan(input: {
  caseId: string;
  title: string;
  summary: string;
}) {
  return call<LabTreatmentPlan>('/lab/treatment-plans', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLabTreatmentPlan(
  id: string,
  input: { title?: string; summary?: string },
) {
  return call<LabTreatmentPlan>(`/lab/treatment-plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function proposeLabTreatmentPlan(id: string) {
  return call<LabTreatmentPlan>(`/lab/treatment-plans/${id}/propose`, {
    method: 'POST',
  });
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
  return call<PresignResponse>(`/lab/treatment-plans/${id}/files/presign`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteLabTreatmentPlanFile(id: string, fileId: string) {
  return call<void>(`/lab/treatment-plans/${id}/files/${fileId}`, {
    method: 'DELETE',
  });
}

export function decideTreatmentPlan(
  id: string,
  input: { decision: LabTreatmentPlanDecision; notes?: string },
) {
  return call<LabTreatmentPlan>(
    `/clinic/lab-treatment-plans/${id}/decisions`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function draftLabTreatmentPlanSummary(caseId: string) {
  return call<{ summary: string }>(
    `/lab/treatment-plans/draft-summary?caseId=${encodeURIComponent(caseId)}`,
    { method: 'POST' },
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

function disputePath(side: 'lab' | 'clinic', tail = ''): string {
  const root = side === 'lab' ? '/lab/disputes' : '/clinic/lab-disputes';
  return tail ? `${root}${tail}` : root;
}

export function listLabDisputes(side: 'lab' | 'clinic', caseId: string) {
  return call<LabCaseDispute[]>(
    `${disputePath(side)}?caseId=${encodeURIComponent(caseId)}`,
  );
}

export function openLabDispute(
  side: 'lab' | 'clinic',
  input: { caseId: string; kind: LabCaseDisputeKind; reason: string },
) {
  return call<LabCaseDispute>(disputePath(side), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function postLabDisputeMessage(
  side: 'lab' | 'clinic',
  id: string,
  body: string,
) {
  return call<LabCaseDisputeMessage>(disputePath(side, `/${id}/messages`), {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function closeLabDispute(
  side: 'lab' | 'clinic',
  id: string,
  input: {
    status: 'RESOLVED' | 'REJECTED' | 'WITHDRAWN';
    notes?: string;
  },
) {
  return call<LabCaseDispute>(disputePath(side, `/${id}/close`), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
