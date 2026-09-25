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
  forPatient: (patientId: string) =>
    ['consultations', 'patient', patientId] as const,
};

export function useConsultationsForPatient(
  patientId: string,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: consultationKeys.forPatient(patientId),
    enabled: opts.enabled ?? true,
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
    /**
     * `providerId` opens the consult for another clinician, who becomes the
     * provider of record. Required when the caller cannot write consults
     * (ADMIN) — the api answers 400 without it.
     */
    mutationFn: async (vars: { providerId?: string } | void) => {
      const { data, error } = await consultationsControllerStart({
        body: { patientId, providerId: vars?.providerId },
      });
      if (error || !data) {
        const msg = (error as { message?: string | string[] } | undefined)
          ?.message;
        throw new Error(
          (Array.isArray(msg) ? msg.join(', ') : msg) ||
            'Failed to start consultation',
        );
      }
      return data as unknown as Consultation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: consultationKeys.forPatient(patientId),
      });
      queryClient.invalidateQueries({
        queryKey: patientKeys.detail(patientId),
      });
    },
  });
}
