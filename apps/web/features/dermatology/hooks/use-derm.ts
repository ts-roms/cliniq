'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { consultationsControllerGenerateDerm } from '@org/api-client';
import type { GenerateDermInput } from '../schemas/derm';

export function useGenerateDermDraft(consultationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateDermInput) => {
      const { data, error } = await consultationsControllerGenerateDerm({
        path: { id: consultationId },
        body: input,
      });
      if (error || !data) throw new Error('Generation failed');
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['consultations', consultationId, 'suggestions'] }),
  });
}
