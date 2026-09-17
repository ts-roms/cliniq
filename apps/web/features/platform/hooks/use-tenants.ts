'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTenant,
  getPlanCatalog,
  getTenant,
  listTenants,
  updateTenant,
  type CreateTenantInput,
  type ListTenantsQuery,
  type UpdateTenantInput,
} from '../lib/api';

const TENANTS_KEY = ['platform', 'tenants'] as const;

export function useTenants(query: ListTenantsQuery = {}) {
  return useQuery({
    queryKey: [...TENANTS_KEY, 'list', query],
    queryFn: () => listTenants(query),
  });
}

export function useTenant(id: string | null) {
  return useQuery({
    queryKey: [...TENANTS_KEY, 'detail', id],
    queryFn: () => getTenant(id!),
    enabled: !!id,
  });
}

export function usePlanCatalog() {
  return useQuery({
    queryKey: [...TENANTS_KEY, 'catalog'],
    queryFn: getPlanCatalog,
    staleTime: 5 * 60 * 1000, // doesn't change often
  });
}

export function useUpdateTenant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantInput) => updateTenant(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TENANTS_KEY });
    },
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantInput) => createTenant(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TENANTS_KEY });
    },
  });
}
