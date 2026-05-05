'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  labsControllerCancel,
  labsControllerCreate,
  labsControllerListForConsultation,
  labsControllerListForPatient,
  labsControllerRecordResult,
  labsControllerUpdate,
} from '@org/api-client';
import type {
  CreateOrderOutput,
  LabOrder,
  LabOrderStatus,
  RecordResultInput,
} from '../schemas/labs';

export const labKeys = {
  patient: (patientId: string) => ['labs', 'patient', patientId] as const,
  consultation: (consultationId: string) => ['labs', 'consult', consultationId] as const,
};

export function useLabOrdersForPatient(patientId: string) {
  return useQuery({
    queryKey: labKeys.patient(patientId),
    queryFn: async (): Promise<LabOrder[]> => {
      const { data, error } = await labsControllerListForPatient({
        path: { patientId },
      });
      if (error || !data) throw new Error('Failed to load labs');
      return data as unknown as LabOrder[];
    },
    enabled: !!patientId,
  });
}

export function useLabOrdersForConsultation(consultationId: string) {
  return useQuery({
    queryKey: labKeys.consultation(consultationId),
    queryFn: async (): Promise<LabOrder[]> => {
      const { data, error } = await labsControllerListForConsultation({
        path: { id: consultationId },
      });
      if (error || !data) throw new Error('Failed to load labs');
      return data as unknown as LabOrder[];
    },
    enabled: !!consultationId,
  });
}

export function useCreateLabOrder({
  patientId,
  consultationId,
}: {
  patientId: string;
  consultationId?: string;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderOutput) => {
      const { data, error } = await labsControllerCreate({
        body: input as Parameters<typeof labsControllerCreate>[0]['body'],
      });
      if (error || !data) throw new Error('Create failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labKeys.patient(patientId) });
      if (consultationId) {
        qc.invalidateQueries({ queryKey: labKeys.consultation(consultationId) });
      }
    },
  });
}

export function useUpdateOrderStatus({
  patientId,
  consultationId,
}: {
  patientId: string;
  consultationId?: string;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LabOrderStatus }) => {
      const { data, error } = await labsControllerUpdate({
        path: { id },
        body: { status } as Parameters<typeof labsControllerUpdate>[0]['body'],
      });
      if (error || !data) throw new Error('Update failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labKeys.patient(patientId) });
      if (consultationId) {
        qc.invalidateQueries({ queryKey: labKeys.consultation(consultationId) });
      }
    },
  });
}

export function useCancelOrder({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await labsControllerCancel({ path: { id } });
      if (error) throw new Error('Cancel failed');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: labKeys.patient(patientId) }),
  });
}

export function useRecordResult({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      itemId,
      input,
    }: {
      orderId: string;
      itemId: string;
      input: RecordResultInput;
    }) => {
      const { data, error } = await labsControllerRecordResult({
        path: { id: orderId, itemId },
        body: input as Parameters<typeof labsControllerRecordResult>[0]['body'],
      });
      if (error || !data) throw new Error('Save failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: labKeys.patient(patientId) }),
  });
}
