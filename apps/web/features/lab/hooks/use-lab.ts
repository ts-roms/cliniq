'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import type {
  CreateCaseInput,
  CreateInvoiceInput,
  CreateProductInput,
  GenerateFromCasesInput,
  InvoiceFilter,
  InvoiceItemInput,
  LabCaseStatus,
  LabPaymentLinkProvider,
  LabTreatmentPlanDecision,
} from '../lib/api';

const KEY = ['lab'] as const;

// ── Clinic links ─────────────────────────────────────────────

export function useLabClinicLinks() {
  return useQuery({
    queryKey: [...KEY, 'links'],
    queryFn: api.listLabClinicLinks,
  });
}

export function useInviteClinic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.inviteClinic,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'links'] }),
  });
}

export function useRevokeLabInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeLabInvitation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'links'] }),
  });
}

// ── Clinic-side invitations ─────────────────────────────────

export function useClinicInvitations() {
  return useQuery({
    queryKey: [...KEY, 'clinic-invitations'],
    queryFn: api.listClinicInvitations,
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.acceptInvitation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'clinic-invitations'] }),
  });
}

export function useRejectInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.rejectInvitation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'clinic-invitations'] }),
  });
}

// ── Catalog ─────────────────────────────────────────────────

export function useLabProducts(opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: [...KEY, 'products', opts],
    queryFn: () => api.listProducts(opts),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => api.createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'products'] }),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateProductInput> & { isActive?: boolean }) =>
      api.updateProduct(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'products'] }),
  });
}

// ── Cases (lab side) ────────────────────────────────────────

export function useLabCases(opts?: { status?: LabCaseStatus; tagId?: string }) {
  return useQuery({
    queryKey: [...KEY, 'cases', 'lab', opts],
    queryFn: () => api.listLabCases(opts),
  });
}

// ── Tags ────────────────────────────────────────────────────

export function useLabTags() {
  return useQuery({
    queryKey: [...KEY, 'tags'],
    queryFn: api.listLabTags,
  });
}

export function useCreateLabTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createLabTag,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'tags'] }),
  });
}

export function useDeleteLabTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteLabTag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'tags'] }),
  });
}

export function useCaseTags(caseId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'case-tags', caseId],
    queryFn: () => api.listCaseTags(caseId!),
    enabled: !!caseId,
  });
}

export function useAssignCaseTag(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => api.assignCaseTag(caseId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'case-tags', caseId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'cases', 'lab'] });
    },
  });
}

export function useUnassignCaseTag(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => api.unassignCaseTag(caseId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'case-tags', caseId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'cases', 'lab'] });
    },
  });
}

export function useLabCase(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'case', id],
    queryFn: () => api.getLabCase(id!),
    enabled: !!id,
  });
}

export function useTransitionLabCase(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, reason }: { status: LabCaseStatus; reason?: string }) =>
      api.transitionLabCase(id, status, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'case', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'cases', 'lab'] });
    },
  });
}

// ── Phases ──────────────────────────────────────────────────

export function useLabCasePhases(caseId: string | null, side: 'lab' | 'clinic') {
  return useQuery({
    queryKey: [...KEY, 'phases', side, caseId],
    queryFn: () =>
      side === 'lab'
        ? api.listLabCasePhases(caseId!)
        : api.listClinicCasePhases(caseId!),
    enabled: !!caseId,
    refetchInterval: 15_000, // light polling so the clinic sees lab progress
  });
}

export function useAdvanceLabCasePhase(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { phase?: string; notes?: string }) =>
      api.advanceLabCasePhase(caseId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'phases', 'lab', caseId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'phases', 'clinic', caseId] });
    },
  });
}

// ── Internal notes (lab-only) ───────────────────────────────

export function useLabCaseNotes(caseId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'notes', caseId],
    queryFn: () => api.listLabCaseNotes(caseId!),
    enabled: !!caseId,
  });
}

export function useCreateLabCaseNote(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.createLabCaseNote(caseId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'notes', caseId] }),
  });
}

export function useUpdateLabCaseNote(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) =>
      api.updateLabCaseNote(caseId, noteId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'notes', caseId] }),
  });
}

export function useDeleteLabCaseNote(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => api.deleteLabCaseNote(caseId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'notes', caseId] }),
  });
}

// ── Chat ────────────────────────────────────────────────────

export function useLabCaseMessages(caseId: string | null, side: 'lab' | 'clinic') {
  return useQuery({
    queryKey: [...KEY, 'messages', side, caseId],
    queryFn: () =>
      side === 'lab'
        ? api.listLabCaseMessages(caseId!)
        : api.listClinicCaseMessages(caseId!),
    enabled: !!caseId,
    refetchInterval: 5_000, // simple polling — swap for SSE/WebSocket later
  });
}

export function useSendLabCaseMessage(caseId: string, side: 'lab' | 'clinic') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      side === 'lab'
        ? api.createLabCaseMessage(caseId, body)
        : api.createClinicCaseMessage(caseId, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...KEY, 'messages', side, caseId] }),
  });
}

// ── Compliance ──────────────────────────────────────────────

export function useConformityTemplates() {
  return useQuery({
    queryKey: [...KEY, 'conformity'],
    queryFn: api.listConformityTemplates,
  });
}
export function useCreateConformityTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createConformityTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'conformity'] }),
  });
}
export function useDeleteConformityTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConformityTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'conformity'] }),
  });
}

export function useConsentTemplates(side: 'lab' | 'clinic') {
  return useQuery({
    queryKey: [...KEY, 'consent', side],
    queryFn: () =>
      side === 'lab'
        ? api.listLabConsentTemplates()
        : api.listClinicConsentTemplates(),
  });
}
export function useCreateConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createConsentTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'consent'] }),
  });
}
export function useDeleteConsentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteConsentTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'consent'] }),
  });
}

export function useCaseSignatures(caseId: string | null, side: 'lab' | 'clinic') {
  return useQuery({
    queryKey: [...KEY, 'signatures', side, caseId],
    queryFn: () =>
      side === 'lab'
        ? api.listLabCaseSignatures(caseId!)
        : api.listClinicCaseSignatures(caseId!),
    enabled: !!caseId,
  });
}
export function useCaptureClinicCaseSignature(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      templateId: string;
      signedByName: string;
      signedByRole?: string;
      signatureFileKey: string;
    }) => api.captureClinicCaseSignature(caseId, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...KEY, 'signatures'] }),
  });
}

// ── Materials ───────────────────────────────────────────────

export function useMaterials() {
  return useQuery({
    queryKey: [...KEY, 'materials'],
    queryFn: api.listMaterials,
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createMaterial,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'materials'] }),
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMaterial(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'materials'] }),
  });
}

export function useMaterialLots(materialId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'lots', materialId],
    queryFn: () => api.listMaterialLots(materialId!),
    enabled: !!materialId,
  });
}

export function useCreateMaterialLot(materialId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createMaterialLot>[1]) =>
      api.createMaterialLot(materialId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'lots', materialId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'materials'] });
    },
  });
}

export function useUpdateMaterialLot(materialId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      lotId,
      ...input
    }: {
      lotId: string;
      status?: api.LabMaterialLotStatus;
      expiresAt?: string | null;
      notes?: string | null;
    }) => api.updateMaterialLot(lotId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'lots', materialId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'materials'] });
    },
  });
}

export function useCaseMaterialUsages(caseId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'usages', caseId],
    queryFn: () => api.listCaseMaterialUsages(caseId!),
    enabled: !!caseId,
  });
}

export function useRecordCaseMaterialUsage(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { lotId: string; qty: number }) =>
      api.recordCaseMaterialUsage(caseId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'usages', caseId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'lots'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'materials'] });
    },
  });
}

export function useDeleteCaseMaterialUsage(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (usageId: string) => api.deleteCaseMaterialUsage(caseId, usageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'usages', caseId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'lots'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'materials'] });
    },
  });
}

// ── Shipments ───────────────────────────────────────────────

export function useLabCaseShipment(caseId: string | null, side: 'lab' | 'clinic') {
  return useQuery({
    queryKey: [...KEY, 'shipment', side, caseId],
    queryFn: () =>
      side === 'lab'
        ? api.getLabCaseShipment(caseId!)
        : api.getClinicCaseShipment(caseId!),
    enabled: !!caseId,
  });
}

export function useUpsertLabCaseShipment(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      carrier?: string | null;
      trackingNumber?: string | null;
      notes?: string | null;
    }) => api.upsertLabCaseShipment(caseId, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...KEY, 'shipment'] }),
  });
}

export function useMarkLabCaseDelivered(caseId: string, side: 'lab' | 'clinic') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      side === 'lab'
        ? api.markLabCaseDelivered(caseId)
        : api.markClinicCaseDelivered(caseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'shipment'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'case', caseId] });
      qc.invalidateQueries({ queryKey: [...KEY, 'clinic-case', caseId] });
    },
  });
}

// ── Cases (clinic side) ─────────────────────────────────────

export function useClinicCases(opts?: { status?: LabCaseStatus }) {
  return useQuery({
    queryKey: [...KEY, 'cases', 'clinic', opts],
    queryFn: () => api.listClinicCases(opts),
  });
}

export function useClinicCase(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'clinic-case', id],
    queryFn: () => api.getClinicCase(id!),
    enabled: !!id,
  });
}

export function useCreateClinicCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCaseInput) => api.createClinicCase(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'cases', 'clinic'] }),
  });
}

export function useTransitionClinicCase(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, reason }: { status: LabCaseStatus; reason?: string }) =>
      api.transitionClinicCase(id, status, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'clinic-case', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'cases', 'clinic'] });
    },
  });
}

// ── Invoices (lab side) ─────────────────────────────────────

export function useLabInvoices(filter: InvoiceFilter = {}) {
  return useQuery({
    queryKey: [...KEY, 'invoices', 'lab', filter],
    queryFn: () => api.listLabInvoices(filter),
  });
}

export function useLabInvoice(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'invoice', 'lab', id],
    queryFn: () => api.getLabInvoice(id!),
    enabled: !!id,
  });
}

export function useCreateLabInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => api.createLabInvoice(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] }),
  });
}

export function useGenerateInvoiceFromCases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateFromCasesInput) => api.generateInvoiceFromCases(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] }),
  });
}

export function useUpdateLabInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { dueAt?: string | null; notes?: string | null; taxCents?: number }) =>
      api.updateLabInvoice(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] });
    },
  });
}

export function useAddLabInvoiceItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InvoiceItemInput) => api.addLabInvoiceItem(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] });
    },
  });
}

export function useUpdateLabInvoiceItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: Partial<InvoiceItemInput> }) =>
      api.updateLabInvoiceItem(id, itemId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] });
    },
  });
}

export function useDeleteLabInvoiceItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.deleteLabInvoiceItem(id, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] });
    },
  });
}

export function useIssueLabInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.issueLabInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] });
    },
  });
}

export function useRecordLabInvoicePayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountCents: number; paidAt?: string; reference?: string }) =>
      api.recordLabInvoicePayment(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] });
    },
  });
}

export function useVoidLabInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.voidLabInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] });
    },
  });
}

export function useCreateLabPaymentLink(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      provider?: LabPaymentLinkProvider;
      amountCents?: number;
      externalId?: string;
      url?: string;
      expiresAt?: string;
    }) => api.createLabPaymentLink(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] }),
  });
}

export function useCancelLabPaymentLink(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => api.cancelLabPaymentLink(id, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'invoice', 'lab', id] }),
  });
}

// ── Invoices (clinic side, read-only) ───────────────────────

export function useClinicInvoices(filter: InvoiceFilter = {}) {
  return useQuery({
    queryKey: [...KEY, 'invoices', 'clinic', filter],
    queryFn: () => api.listClinicInvoices(filter),
  });
}

export function useClinicInvoice(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'invoice', 'clinic', id],
    queryFn: () => api.getClinicInvoice(id!),
    enabled: !!id,
  });
}

// ── PDFs ────────────────────────────────────────────────────

export function useGenerateLabInvoicePdf(id: string) {
  return useMutation({
    mutationFn: () => api.generateLabInvoicePdf(id),
  });
}

export function useGetClinicInvoicePdf(id: string) {
  return useMutation({
    mutationFn: () => api.getClinicInvoicePdf(id),
  });
}

export function useRenderConformityPdf(caseId: string) {
  return useMutation({
    mutationFn: (templateId?: string) => api.renderConformityPdf(caseId, templateId),
  });
}

// ── Monthly sweep ───────────────────────────────────────────

export function useRunMonthlyInvoiceSweep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (period?: string) => api.runMonthlyInvoiceSweep(period),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'invoices'] }),
  });
}

// ── Stats ───────────────────────────────────────────────────

export function useLabStats() {
  return useQuery({
    queryKey: [...KEY, 'stats'],
    queryFn: api.getLabStats,
  });
}

// ── Treatment plans ─────────────────────────────────────────

export function useLabTreatmentPlans(caseId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'treatment-plans', 'lab', caseId],
    queryFn: () => api.listLabTreatmentPlans(caseId!),
    enabled: !!caseId,
  });
}

export function useClinicTreatmentPlans(caseId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'treatment-plans', 'clinic', caseId],
    queryFn: () => api.listClinicTreatmentPlans(caseId!),
    enabled: !!caseId,
  });
}

export function useLabTreatmentPlan(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'treatment-plan', 'lab', id],
    queryFn: () => api.getLabTreatmentPlan(id!),
    enabled: !!id,
  });
}

export function useClinicTreatmentPlan(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'treatment-plan', 'clinic', id],
    queryFn: () => api.getClinicTreatmentPlan(id!),
    enabled: !!id,
  });
}

export function useCreateLabTreatmentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { caseId: string; title: string; summary: string }) =>
      api.createLabTreatmentPlan(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'treatment-plans'] }),
  });
}

export function useUpdateLabTreatmentPlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; summary?: string }) =>
      api.updateLabTreatmentPlan(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'treatment-plan', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'treatment-plans'] });
    },
  });
}

export function useProposeLabTreatmentPlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.proposeLabTreatmentPlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'treatment-plan', 'lab', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'treatment-plans'] });
    },
  });
}

export function useDecideTreatmentPlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      decision: LabTreatmentPlanDecision;
      notes?: string;
    }) => api.decideTreatmentPlan(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'treatment-plan', 'clinic', id] });
      qc.invalidateQueries({ queryKey: [...KEY, 'treatment-plans'] });
    },
  });
}
