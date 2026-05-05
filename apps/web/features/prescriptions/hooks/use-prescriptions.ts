'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  prescriptionsControllerCancel,
  prescriptionsControllerCreate,
  prescriptionsControllerList,
  prescriptionsControllerPrecheck,
} from '@org/api-client';
import type {
  CreatePrescriptionInput,
  InteractionFinding,
  Prescription,
} from '../schemas/prescription';

export const prescriptionKeys = {
  all: ['prescriptions'] as const,
  forPatient: (patientId: string) => ['prescriptions', 'patient', patientId] as const,
};

export function usePrescriptionsForPatient(patientId: string) {
  return useQuery({
    queryKey: prescriptionKeys.forPatient(patientId),
    queryFn: async (): Promise<Prescription[]> => {
      const { data, error } = await prescriptionsControllerList({
        query: { patientId },
      });
      if (error) throw new Error('Failed to load prescriptions');
      return (data ?? []) as unknown as Prescription[];
    },
  });
}

export function usePrecheckPrescription() {
  return useMutation({
    mutationFn: async (input: CreatePrescriptionInput) => {
      const { data, error } = await prescriptionsControllerPrecheck({
        body: input as Parameters<typeof prescriptionsControllerPrecheck>[0]['body'],
      });
      if (error || !data) throw new Error('Precheck failed');
      return data as unknown as { findings: InteractionFinding[]; blocking: boolean };
    },
  });
}

export function useCreatePrescription(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePrescriptionInput) => {
      const { data, error } = await prescriptionsControllerCreate({
        body: input as Parameters<typeof prescriptionsControllerCreate>[0]['body'],
      });
      if (error || !data) {
        const err = error as { message?: string } | undefined;
        throw new Error(err?.message ?? 'Create failed');
      }
      return data as unknown as Prescription & { safetyFindings: InteractionFinding[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prescriptionKeys.forPatient(patientId) });
    },
  });
}

export function useCancelPrescription(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await prescriptionsControllerCancel({ path: { id } });
      if (error || !data) throw new Error('Cancel failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prescriptionKeys.forPatient(patientId) });
    },
  });
}
