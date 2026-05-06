'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/api';
import type {
  CreateCaseInput,
  CreateProductInput,
  LabCaseStatus,
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
