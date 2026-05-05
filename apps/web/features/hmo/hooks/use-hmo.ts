'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  hmoControllerAddMembership,
  hmoControllerCreateProvider,
  hmoControllerFileClaim,
  hmoControllerListClaims,
  hmoControllerListMemberships,
  hmoControllerListProviders,
  hmoControllerRecordPayment,
  hmoControllerUpdateClaim,
} from '@org/api-client';
import type {
  CreateMembershipInput,
  CreateProviderInput,
  FileClaimOutput,
  HmoClaim,
  HmoMembership,
  HmoProvider,
  RecordPaymentOutput,
  UpdateClaimOutput,
} from '../schemas/hmo';

export const hmoKeys = {
  all: ['hmo'] as const,
  providers: () => ['hmo', 'providers'] as const,
  memberships: (patientId: string) => ['hmo', 'memberships', patientId] as const,
  claims: () => ['hmo', 'claims'] as const,
};

export function useProviders() {
  return useQuery({
    queryKey: hmoKeys.providers(),
    queryFn: async (): Promise<HmoProvider[]> => {
      const { data, error } = await hmoControllerListProviders();
      if (error || !data) throw new Error('Failed to load providers');
      return data as unknown as HmoProvider[];
    },
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProviderInput) => {
      const { data, error } = await hmoControllerCreateProvider({
        body: {
          ...input,
          contactEmail: input.contactEmail || undefined,
        } as Parameters<typeof hmoControllerCreateProvider>[0]['body'],
      });
      if (error || !data) throw new Error('Create failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: hmoKeys.providers() }),
  });
}

export function useMemberships(patientId: string) {
  return useQuery({
    queryKey: hmoKeys.memberships(patientId),
    queryFn: async (): Promise<HmoMembership[]> => {
      const { data, error } = await hmoControllerListMemberships({
        path: { patientId },
      });
      if (error || !data) throw new Error('Failed to load memberships');
      return data as unknown as HmoMembership[];
    },
    enabled: !!patientId,
  });
}

export function useAddMembership(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMembershipInput) => {
      const body = {
        ...input,
        ...(input.validFrom ? { validFrom: new Date(input.validFrom).toISOString() } : {}),
        ...(input.validUntil ? { validUntil: new Date(input.validUntil).toISOString() } : {}),
      };
      const { data, error } = await hmoControllerAddMembership({
        path: { patientId },
        body: body as Parameters<typeof hmoControllerAddMembership>[0]['body'],
      });
      if (error || !data) throw new Error('Add failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: hmoKeys.memberships(patientId) }),
  });
}

export function useClaims() {
  return useQuery({
    queryKey: hmoKeys.claims(),
    queryFn: async (): Promise<HmoClaim[]> => {
      const { data, error } = await hmoControllerListClaims();
      if (error || !data) throw new Error('Failed to load claims');
      return data as unknown as HmoClaim[];
    },
  });
}

export function useFileClaim(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FileClaimOutput) => {
      const { data, error } = await hmoControllerFileClaim({
        path: { id: invoiceId },
        body: input as Parameters<typeof hmoControllerFileClaim>[0]['body'],
      });
      if (error || !data) throw new Error('Filing failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hmoKeys.claims() });
      qc.invalidateQueries({ queryKey: ['billing'] });
    },
  });
}

export function useUpdateClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateClaimOutput }) => {
      const { data, error } = await hmoControllerUpdateClaim({
        path: { id },
        body: input as Parameters<typeof hmoControllerUpdateClaim>[0]['body'],
      });
      if (error || !data) throw new Error('Update failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: hmoKeys.claims() }),
  });
}

export function useRecordHmoPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: RecordPaymentOutput }) => {
      const { data, error } = await hmoControllerRecordPayment({
        path: { id },
        body: input as Parameters<typeof hmoControllerRecordPayment>[0]['body'],
      });
      if (error || !data) throw new Error('Payment failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: hmoKeys.claims() });
      qc.invalidateQueries({ queryKey: ['billing'] });
    },
  });
}
