import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  notificationsControllerList,
  notificationsControllerMarkAllRead,
  notificationsControllerMarkRead,
} from '@org/api-client';

interface Notification {
  id: string;
  kind: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const SEV_BORDER: Record<string, string> = {
  INFO: 'border-l-blue-400',
  WARNING: 'border-l-amber-400',
  CRITICAL: 'border-l-rose-500',
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await notificationsControllerList({
        query: { unread: 'true' },
      });
      if (error || !data) return 0;
      return (data as unknown as Notification[]).length;
    },
  });
}

export function NotificationsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['notifications', 'mobile'],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await notificationsControllerList();
      if (error || !data) throw new Error('Failed to load');
      return data as unknown as Notification[];
    },
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await notificationsControllerMarkRead({ path: { id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: async () => {
      await notificationsControllerMarkAllRead();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.filter((n) => !n.readAt).length ?? 0;

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border bg-card px-6 pb-3 pt-4">
        <View>
          <Text className="text-xs uppercase tracking-widest text-primary">Inbox</Text>
          <Text className="text-xl font-semibold text-foreground">
            Notifications{unread > 0 ? ` · ${unread} new` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => markAll.mutate()}
          disabled={unread === 0 || markAll.isPending}
          className={`rounded-md border border-border px-3 py-1.5 ${
            unread === 0 ? 'opacity-50' : ''
          }`}
        >
          <Text className="text-xs text-foreground">Mark all read</Text>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      )}
      {error && (
        <View className="px-6 py-4">
          <Text className="text-sm text-destructive">{(error as Error).message}</Text>
        </View>
      )}
      {data && (
        <FlatList
          data={data}
          keyExtractor={(n) => n.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="px-6 py-8 text-center text-sm text-muted-foreground">
              No notifications yet.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                if (!item.readAt) markRead.mutate(item.id);
              }}
              className={`border-b border-border border-l-4 ${SEV_BORDER[item.severity] ?? ''} px-6 py-3 ${
                item.readAt ? 'bg-card' : 'bg-muted/30'
              }`}
            >
              <Text
                className={`text-sm ${
                  item.readAt ? 'text-muted-foreground' : 'font-medium text-foreground'
                }`}
              >
                {item.title}
              </Text>
              {item.body && (
                <Text className="text-xs text-muted-foreground">{item.body}</Text>
              )}
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {item.kind.replace(/_/g, ' ').toLowerCase()} · {timeAgo(item.createdAt)} ago
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
