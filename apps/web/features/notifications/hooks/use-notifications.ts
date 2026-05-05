'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  notificationsControllerList,
  notificationsControllerMarkAllRead,
  notificationsControllerMarkRead,
  notificationsControllerUnreadCount,
} from '@org/api-client';
import { useSession } from '@/features/auth';
import type { Notification } from '../schemas/notification';

export const notificationKeys = {
  list: (unread: boolean) => ['notifications', 'list', unread] as const,
  count: () => ['notifications', 'count'] as const,
};

const POLL_INTERVAL_MS = 60_000;

export function useNotifications(unreadOnly = false) {
  const session = useSession();
  return useQuery({
    queryKey: notificationKeys.list(unreadOnly),
    enabled: !!session,
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await notificationsControllerList({
        query: { unread: unreadOnly ? 'true' : undefined },
      });
      if (error || !data) throw new Error('Failed to load notifications');
      return data as unknown as Notification[];
    },
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useUnreadCount() {
  const session = useSession();
  return useQuery({
    queryKey: notificationKeys.count(),
    enabled: !!session,
    queryFn: async (): Promise<number> => {
      const { data, error } = await notificationsControllerUnreadCount();
      if (error || data === undefined || data === null) return 0;
      return Number(data);
    },
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await notificationsControllerMarkRead({ path: { id } });
      if (error) throw new Error('mark-read failed');
      return { id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await notificationsControllerMarkAllRead();
      if (error) throw new Error('mark-all-read failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
