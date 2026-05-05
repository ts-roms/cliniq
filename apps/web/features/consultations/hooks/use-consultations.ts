'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  consultationsControllerList,
  consultationsControllerStart,
} from '@org/api-client';
import type { Consultation } from '../schemas/consultation';
import { patientKeys } from '@/features/patients/hooks/use-patients';

export const consultationKeys = {
  all: ['consultations'] as const,
  forPatient: (patientId: string) => ['consultations', 'patient', patientId] as const,
};

export function useConsultationsForPatient(patientId: string) {
  return useQuery({
    queryKey: consultationKeys.forPatient(patientId),
    queryFn: async (): Promise<Consultation[]> => {
      const { data, error } = await consultationsControllerList({
        query: { patientId },
      });
      if (error) throw new Error('Failed to load consultations');
      return (data ?? []) as unknown as Consultation[];
    },
  });
}

export function useStartConsultation(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await consultationsControllerStart({
        body: { patientId },
      });
      if (error || !data) throw new Error('Failed to start consultation');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consultationKeys.forPatient(patientId) });
      queryClient.invalidateQueries({ queryKey: patientKeys.detail(patientId) });
    },
  });
}
