import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { meControllerAppointments } from '@org/api-client';
import { useT } from '../../shared/i18n';

interface Appt {
  id: string;
  startsAt: string;
  endsAt: string;
  type: string;
  status: string;
  reason: string | null;
}

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: 'text-blue-700',
  CHECKED_IN: 'text-amber-700',
  IN_PROGRESS: 'text-indigo-700',
  COMPLETED: 'text-emerald-700',
  CANCELLED: 'text-zinc-500',
  NO_SHOW: 'text-rose-700',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PortalAppointmentsScreen() {
  const t = useT();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: async (): Promise<Appt[]> => {
      const { data, error } = await meControllerAppointments();
      if (error || !data) throw new Error('Failed to load');
      return data as unknown as Appt[];
    },
  });

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border bg-card px-6 pb-3 pt-4">
        <Text className="text-xs uppercase tracking-widest text-primary">
          {t('app.brand')}
        </Text>
        <Text className="text-xl font-semibold text-foreground">
          {t('portal.tabs.appointments')}
        </Text>
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
          keyExtractor={(a) => a.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="px-6 py-8 text-center text-sm text-muted-foreground">
              {t('portal.empty.appointments')}
            </Text>
          }
          renderItem={({ item }) => (
            <View className="border-b border-border px-6 py-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-medium text-foreground">
                  {formatDateTime(item.startsAt)}
                </Text>
                <Text className={`text-xs ${STATUS_TONE[item.status] ?? ''}`}>
                  {item.status.replace('_', ' ')}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {item.type}
                {item.reason ? ` · ${item.reason}` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
