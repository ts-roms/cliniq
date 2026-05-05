'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsControllerBroadcast } from '@org/api-client';

export interface BroadcastInput {
  title: string;
  body?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  roles?: Array<'OWNER' | 'ADMIN' | 'DOCTOR' | 'NURSE' | 'RECEPTIONIST' | 'PATIENT'>;
  link?: string;
}

export function useBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BroadcastInput) => {
      const { data, error } = await notificationsControllerBroadcast({
        body: input as Parameters<typeof notificationsControllerBroadcast>[0]['body'],
      });
      if (error || !data) throw new Error('Broadcast failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
