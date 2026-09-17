'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  availabilityControllerAddTimeOff,
  availabilityControllerGet,
  availabilityControllerListProviders,
  availabilityControllerRemoveTimeOff,
  availabilityControllerSetWeekly,
  availabilityControllerSlots,
} from '@org/api-client';

export interface Provider {
  id: string;
  name: string;
  email: string;
  role: string;
  specialty: string | null;
}

export interface WeeklyRange {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes?: number;
}

export interface TimeOff {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface ProviderAvailability {
  providerId: string;
  timezone: string;
  source: 'provider' | 'clinic' | 'none';
  schedule: WeeklyRange[];
  clinicHours: WeeklyRange[];
  timeOff: TimeOff[];
}

export interface FreeSlots {
  providerId: string;
  date: string;
  timezone: string;
  unrestricted: boolean;
  slots: Array<{ startsAt: string; endsAt: string }>;
}

export const availabilityKeys = {
  providers: ['providers'] as const,
  one: (providerId: string) => ['availability', providerId] as const,
  slots: (providerId: string, date: string, duration?: number) =>
    ['availability', providerId, 'slots', date, duration ?? 0] as const,
};

function messageOf(error: unknown, fallback: string): string {
  const e = error as
    | { message?: string | string[]; problems?: string[] }
    | undefined;
  if (e?.problems?.length) return e.problems.join('; ');
  const msg = e?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg || fallback;
}

export function useProviders() {
  return useQuery({
    queryKey: availabilityKeys.providers,
    queryFn: async (): Promise<Provider[]> => {
      const { data, error } = await availabilityControllerListProviders();
      if (error) throw new Error(messageOf(error, 'Failed to load providers'));
      return (data as unknown as Provider[]) ?? [];
    },
  });
}

export function useProviderAvailability(providerId: string | null) {
  return useQuery({
    queryKey: availabilityKeys.one(providerId ?? ''),
    enabled: !!providerId,
    queryFn: async (): Promise<ProviderAvailability> => {
      const { data, error } = await availabilityControllerGet({
        path: { providerId: providerId ?? '' },
      });
      if (error || !data)
        throw new Error(messageOf(error, 'Failed to load availability'));
      return data as unknown as ProviderAvailability;
    },
  });
}

export function useFreeSlots(
  providerId: string | null,
  date: string | null,
  durationMinutes?: number,
) {
  return useQuery({
    queryKey: availabilityKeys.slots(
      providerId ?? '',
      date ?? '',
      durationMinutes,
    ),
    enabled: !!providerId && !!date,
    queryFn: async (): Promise<FreeSlots> => {
      const { data, error } = await availabilityControllerSlots({
        path: { providerId: providerId ?? '' },
        query: { date: date ?? '', durationMinutes },
      });
      if (error || !data)
        throw new Error(messageOf(error, 'Failed to load free slots'));
      return data as unknown as FreeSlots;
    },
  });
}

export function useSetWeeklySchedule(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ranges: WeeklyRange[]) => {
      const { data, error } = await availabilityControllerSetWeekly({
        path: { providerId },
        body: {
          ranges: ranges.map((r) => ({
            weekday: r.weekday,
            startTime: r.startTime,
            endTime: r.endTime,
            slotMinutes: r.slotMinutes,
          })),
        },
      });
      if (error)
        throw new Error(messageOf(error, 'Could not save the schedule'));
      return data as unknown as WeeklyRange[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: availabilityKeys.one(providerId) });
      qc.invalidateQueries({ queryKey: ['availability', providerId, 'slots'] });
    },
  });
}

export function useAddTimeOff(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      startsAt: string;
      endsAt: string;
      reason?: string;
    }) => {
      const { data, error } = await availabilityControllerAddTimeOff({
        path: { providerId },
        body: {
          startsAt: new Date(input.startsAt).toISOString(),
          endsAt: new Date(input.endsAt).toISOString(),
          ...(input.reason ? { reason: input.reason } : {}),
        },
      });
      if (error) throw new Error(messageOf(error, 'Could not add time off'));
      return data as unknown as TimeOff;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['availability', providerId] }),
  });
}

export function useRemoveTimeOff(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await availabilityControllerRemoveTimeOff({
        path: { providerId, id },
      });
      if (error) throw new Error(messageOf(error, 'Could not remove time off'));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['availability', providerId] }),
  });
}
