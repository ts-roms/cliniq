'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appointmentsControllerCancel,
  appointmentsControllerCheckIn,
  appointmentsControllerCreate,
  appointmentsControllerList,
} from '@org/api-client';
import type {
  Appointment,
  CreateAppointmentOutput,
} from '../schemas/appointment';

export const appointmentKeys = {
  all: ['appointments'] as const,
  list: (from: string, to: string, providerId?: string) =>
    ['appointments', 'list', from, to, providerId ?? ''] as const,
};

export function useAppointmentRange(
  from: string,
  to: string,
  providerId?: string,
) {
  return useQuery({
    queryKey: appointmentKeys.list(from, to, providerId),
    queryFn: async (): Promise<Appointment[]> => {
      const { data, error } = await appointmentsControllerList({
        query: { from, to, providerId: providerId || undefined },
      });
      if (error || !data) throw new Error('Failed to load appointments');
      return data as unknown as Appointment[];
    },
    placeholderData: (prev) => prev,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAppointmentOutput) => {
      const { data, error } = await appointmentsControllerCreate({
        body: {
          ...input,
          startsAt: new Date(input.startsAt).toISOString(),
          endsAt: new Date(input.endsAt).toISOString(),
        },
      });
      if (error || !data) throw new Error('Create failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

export function useCheckInAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await appointmentsControllerCheckIn({ path: { id } });
      if (error) throw new Error('Check-in failed');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await appointmentsControllerCancel({ path: { id } });
      if (error) throw new Error('Cancel failed');
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
