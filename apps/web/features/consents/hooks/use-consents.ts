'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consentsControllerList, consentsControllerSet } from '@org/api-client';
import type { ConsentType, PatientConsent } from '../schemas/consent';

export const consentKeys = {
  forPatient: (patientId: string) => ['consents', patientId] as const,
};

export function usePatientConsents(patientId: string) {
  return useQuery({
    queryKey: consentKeys.forPatient(patientId),
    queryFn: async (): Promise<PatientConsent[]> => {
      const { data, error } = await consentsControllerList({ path: { patientId } });
      if (error) throw new Error('Failed to load consents');
      return (data ?? []) as unknown as PatientConsent[];
    },
  });
}

export function useSetConsent(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      type: ConsentType;
      granted: boolean;
      withdrawalReason?: string;
    }) => {
      const { data, error } = await consentsControllerSet({
        path: { patientId },
        body: input,
      });
      if (error || !data) throw new Error('Failed to update consent');
      return data as unknown as PatientConsent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consentKeys.forPatient(patientId) });
    },
  });
}
