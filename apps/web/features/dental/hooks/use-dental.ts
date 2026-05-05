'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dentalControllerGetLatest,
  dentalControllerUpsert,
} from '@org/api-client';
import type { DentalChartRecord, UpsertChartOutput } from '../schemas/dental';

export const dentalKeys = {
  all: (patientId: string) => ['dental', patientId] as const,
  latest: (patientId: string) => ['dental', patientId, 'latest'] as const,
};

export function useLatestDentalChart(patientId: string) {
  return useQuery({
    queryKey: dentalKeys.latest(patientId),
    queryFn: async (): Promise<DentalChartRecord | null> => {
      const { data, error } = await dentalControllerGetLatest({
        path: { patientId },
      });
      if (error) throw new Error('Failed to load dental chart');
      return (data as unknown as DentalChartRecord | null) ?? null;
    },
  });
}

export function useUpsertDentalChart(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertChartOutput) => {
      const { data, error } = await dentalControllerUpsert({
        path: { patientId },
        body: input as Parameters<typeof dentalControllerUpsert>[0]['body'],
      });
      if (error || !data) throw new Error('Save failed');
      return data as unknown as DentalChartRecord;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: dentalKeys.latest(patientId) }),
  });
}
