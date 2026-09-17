'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appointmentsControllerCancel,
  appointmentsControllerCheckIn,
  appointmentsControllerComplete,
  appointmentsControllerCreate,
  appointmentsControllerList,
  appointmentsControllerNoShow,
  appointmentsControllerReschedule,
  appointmentsControllerStart,
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
    mutationFn: async (input: string | { id: string; reason?: string }) => {
      const { id, reason } =
        typeof input === 'string' ? { id: input, reason: undefined } : input;
      const { error } = await appointmentsControllerCancel({
        path: { id },
        body: reason ? { reason } : {},
      });
      if (error) throw new Error(messageOf(error, 'Cancel failed'));
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

function messageOf(error: unknown, fallback: string): string {
  const msg = (error as { message?: string | string[] } | undefined)?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg || fallback;
}

/** IN_PROGRESS + opens the consult; resolves with the consultation id. */
export function useStartAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      id: string,
    ): Promise<{ id: string; consultationId: string | null }> => {
      const { data, error } = await appointmentsControllerStart({
        path: { id },
      });
      if (error || !data)
        throw new Error(messageOf(error, 'Could not start the consult'));
      const appt = data as unknown as Appointment;
      return { id, consultationId: appt.consultation?.id ?? null };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

export function useCompleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await appointmentsControllerComplete({ path: { id } });
      if (error)
        throw new Error(messageOf(error, 'Could not complete the appointment'));
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

export function useNoShowAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await appointmentsControllerNoShow({ path: { id } });
      if (error) throw new Error(messageOf(error, 'Could not mark as no-show'));
      return { id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      startsAt: string;
      endsAt: string;
      providerId?: string;
    }) => {
      const { error } = await appointmentsControllerReschedule({
        path: { id: input.id },
        body: {
          startsAt: new Date(input.startsAt).toISOString(),
          endsAt: new Date(input.endsAt).toISOString(),
          ...(input.providerId ? { providerId: input.providerId } : {}),
        },
      });
      if (error) throw new Error(messageOf(error, 'Could not reschedule'));
      return { id: input.id };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
