'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  delegationsControllerCreate,
  delegationsControllerListGranted,
  delegationsControllerListReceivedActive,
  delegationsControllerRevoke,
} from '@org/api-client';
import type {
  CreateDelegationOutput,
  DelegationRecord,
} from '../schemas/delegation';

export const delegationKeys = {
  all: ['delegations'] as const,
  granted: ['delegations', 'granted'] as const,
  received: ['delegations', 'received'] as const,
};

export function useGrantedDelegations() {
  return useQuery({
    queryKey: delegationKeys.granted,
    queryFn: async (): Promise<DelegationRecord[]> => {
      const { data, error } = await delegationsControllerListGranted();
      if (error) throw new Error('Failed to load delegations');
      return (data as unknown as DelegationRecord[]) ?? [];
    },
  });
}

export function useReceivedDelegations() {
  return useQuery({
    queryKey: delegationKeys.received,
    queryFn: async (): Promise<DelegationRecord[]> => {
      const { data, error } = await delegationsControllerListReceivedActive();
      if (error) throw new Error('Failed to load delegations');
      return (data as unknown as DelegationRecord[]) ?? [];
    },
    // Re-poll every 60s — drives the "Acting as" picker freshness so a revoke
    // is reflected without a page reload.
    refetchInterval: 60_000,
  });
}

export function useCreateDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDelegationOutput) => {
      const { data, error } = await delegationsControllerCreate({
        body: {
          delegateeId: input.delegateeId,
          startsAt: input.startsAt.toISOString(),
          endsAt: input.endsAt.toISOString(),
          reason: input.reason,
          scope: input.scope ?? [],
        } as unknown as Parameters<typeof delegationsControllerCreate>[0]['body'],
      });
      if (error || !data) throw new Error('Create failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: delegationKeys.granted });
      qc.invalidateQueries({ queryKey: delegationKeys.received });
    },
  });
}

export function useRevokeDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await delegationsControllerRevoke({
        path: { id },
      });
      if (error || !data) throw new Error('Revoke failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: delegationKeys.granted });
      qc.invalidateQueries({ queryKey: delegationKeys.received });
    },
  });
}
