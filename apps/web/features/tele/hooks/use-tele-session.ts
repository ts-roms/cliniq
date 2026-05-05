'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  teleControllerCreate,
  teleControllerDetail,
  teleControllerEnd,
  teleControllerIce,
  teleControllerJoin,
} from '@org/api-client';
import type { IceConfig, PatientJoinResponse, ProviderSession } from '../schemas/tele';

export const teleKeys = {
  ice: ['tele', 'ice'] as const,
  session: (id: string) => ['tele', 'session', id] as const,
};

export function useIceConfig() {
  return useQuery({
    queryKey: teleKeys.ice,
    staleTime: 60_000,
    queryFn: async (): Promise<IceConfig> => {
      const { data, error } = await teleControllerIce();
      if (error || !data) throw new Error('failed to load ICE config');
      return data as unknown as IceConfig;
    },
  });
}

export function useProviderSession(id: string | null) {
  return useQuery({
    queryKey: teleKeys.session(id ?? '_'),
    enabled: !!id,
    queryFn: async (): Promise<ProviderSession> => {
      const { data, error } = await teleControllerDetail({ path: { id: id ?? '' } });
      if (error || !data) throw new Error('session not found');
      return data as unknown as ProviderSession;
    },
  });
}

export function useCreateTeleSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      patientId: string;
      appointmentId?: string;
      consultationId?: string;
    }) => {
      const { data, error } = await teleControllerCreate({
        body: input,
      });
      if (error || !data) throw new Error('create failed');
      return data as unknown as ProviderSession;
    },
    onSuccess: (session) => {
      qc.setQueryData(teleKeys.session(session.id), session);
    },
  });
}

export function useEndTeleSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await teleControllerEnd({ path: { id } });
      if (error) throw new Error('end failed');
      return { id };
    },
    onSuccess: ({ id }) => qc.invalidateQueries({ queryKey: teleKeys.session(id) }),
  });
}

export function usePatientJoin() {
  return useMutation({
    mutationFn: async (joinToken: string): Promise<PatientJoinResponse> => {
      const { data, error } = await teleControllerJoin({
        body: { joinToken },
      });
      if (error || !data) throw new Error('invalid or expired join link');
      return data as unknown as PatientJoinResponse;
    },
  });
}
