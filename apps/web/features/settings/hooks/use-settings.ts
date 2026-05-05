'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  settingsControllerGet,
  settingsControllerUpdate,
} from '@org/api-client';
import type { SettingsOutput, TenantSettings } from '../schemas/settings';

export const settingsKeys = {
  current: ['settings', 'current'] as const,
};

export function useTenantSettings() {
  return useQuery({
    queryKey: settingsKeys.current,
    queryFn: async (): Promise<TenantSettings> => {
      const { data, error } = await settingsControllerGet();
      if (error || !data) throw new Error('Failed to load settings');
      return data as unknown as TenantSettings;
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SettingsOutput) => {
      const { data, error } = await settingsControllerUpdate({
        body: input as Parameters<typeof settingsControllerUpdate>[0]['body'],
      });
      if (error || !data) throw new Error('Update failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.current }),
  });
}
