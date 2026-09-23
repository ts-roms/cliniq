'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  visitTypesControllerCreate,
  visitTypesControllerList,
  visitTypesControllerRemove,
  visitTypesControllerUpdate,
} from '@org/api-client';
import { isClinicModule, type ClinicModule } from '@org/shared-types';

export interface VisitType {
  id: string;
  name: string;
  code: string | null;
  modules: ClinicModule[];
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  description: string | null;
}

export const visitTypeKeys = {
  all: ['visit-types'] as const,
  list: (includeInactive: boolean) =>
    ['visit-types', { includeInactive }] as const,
};

function normalise(row: Record<string, unknown>): VisitType {
  const modules = Array.isArray(row.modules)
    ? (row.modules as string[]).filter(isClinicModule)
    : [];
  return {
    id: String(row.id),
    name: String(row.name),
    code: (row.code as string | null) ?? null,
    modules,
    isDefault: row.isDefault === true,
    active: row.active !== false,
    sortOrder: Number(row.sortOrder ?? 0),
    description: (row.description as string | null) ?? null,
  };
}

export function useVisitTypes(opts?: { includeInactive?: boolean }) {
  const includeInactive = opts?.includeInactive ?? false;
  return useQuery({
    queryKey: visitTypeKeys.list(includeInactive),
    queryFn: async (): Promise<VisitType[]> => {
      const { data, error } = await visitTypesControllerList({
        query: includeInactive ? { includeInactive: true } : undefined,
      });
      if (error || !data) throw new Error('Failed to load visit types');
      return (data as Record<string, unknown>[]).map(normalise);
    },
  });
}

/** The entry a picker should start on: the clinic's default, if it set one. */
export function useDefaultVisitType(): VisitType | undefined {
  const { data } = useVisitTypes();
  return data?.find((v) => v.isDefault);
}

export function useCreateVisitType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data, error } = await visitTypesControllerCreate({
        body: body as Parameters<typeof visitTypesControllerCreate>[0]['body'],
      });
      if (error || !data) throw new Error('Could not create visit type');
      return normalise(data as Record<string, unknown>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: visitTypeKeys.all }),
  });
}

export function useUpdateVisitType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; body: Record<string, unknown> }) => {
      const { data, error } = await visitTypesControllerUpdate({
        path: { id: args.id },
        body: args.body as Parameters<
          typeof visitTypesControllerUpdate
        >[0]['body'],
      });
      if (error || !data) throw new Error('Could not update visit type');
      return normalise(data as Record<string, unknown>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: visitTypeKeys.all }),
  });
}

export function useDeleteVisitType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await visitTypesControllerRemove({ path: { id } });
      if (error) throw new Error('Could not remove visit type');
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: visitTypeKeys.all }),
  });
}
