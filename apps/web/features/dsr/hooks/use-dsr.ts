'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dsrControllerFile,
  dsrControllerList,
  dsrControllerResolve,
} from '@org/api-client';
import type { Dsr, FileDsrInput, ResolveDsrInput } from '../schemas/dsr';

export const dsrKeys = {
  all: ['dsr'] as const,
  list: () => ['dsr', 'list'] as const,
};

export function useDsrList() {
  return useQuery({
    queryKey: dsrKeys.list(),
    queryFn: async (): Promise<Dsr[]> => {
      const { data, error } = await dsrControllerList();
      if (error || !data) throw new Error('Failed to load requests');
      return data as unknown as Dsr[];
    },
  });
}

export function useFileDsr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FileDsrInput) => {
      const { data, error } = await dsrControllerFile({
        body: input as Parameters<typeof dsrControllerFile>[0]['body'],
      });
      if (error || !data) throw new Error('Filing failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dsrKeys.all }),
  });
}

export function useResolveDsr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: ResolveDsrInput;
    }) => {
      const { data, error } = await dsrControllerResolve({
        path: { id },
        body: input as Parameters<typeof dsrControllerResolve>[0]['body'],
      });
      if (error || !data) throw new Error('Update failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dsrKeys.all }),
  });
}
