import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import {
  consultationsControllerList,
  consultationsControllerStart,
} from '@org/api-client';

interface Consultation {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
}

const STATUS_TONE: Record<string, string> = {
  IN_PROGRESS: 'text-amber-700',
  COMPLETED: 'text-emerald-700',
  CANCELLED: 'text-zinc-500',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ConsultList({
  patientId,
  onSelect,
}: {
  patientId: string;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['consults', patientId],
    queryFn: async (): Promise<Consultation[]> => {
      const { data, error } = await consultationsControllerList({
        query: { patientId },
      });
      if (error || !data) throw new Error('Failed to load');
      return data as unknown as Consultation[];
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await consultationsControllerStart({
        body: { patientId },
      });
      if (error || !data) throw new Error('Start failed');
      return data as unknown as { id: string };
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['consults', patientId] });
      onSelect(created.id);
    },
  });

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs uppercase tracking-wide text-muted-foreground">
          Consultations
        </Text>
        <TouchableOpacity
          onPress={() => start.mutate()}
          disabled={start.isPending}
          className="rounded-md bg-primary px-3 py-1.5"
        >
          <Text className="text-xs font-medium text-primary-foreground">
            {start.isPending ? 'Starting…' : 'Start consult'}
          </Text>
        </TouchableOpacity>
      </View>
      <View className="mt-2">
        {list.isLoading && <ActivityIndicator />}
        {list.error && (
          <Text className="text-xs text-destructive">
            {(list.error as Error).message}
          </Text>
        )}
        {list.data && list.data.length === 0 && (
          <Text className="text-xs text-muted-foreground">No consults yet.</Text>
        )}
        {list.data?.slice(0, 8).map((c) => (
          <TouchableOpacity
            key={c.id}
            onPress={() => onSelect(c.id)}
            className="border-b border-border py-2 active:bg-muted"
          >
            <Text className="text-sm text-foreground">
              {formatDateTime(c.startedAt)}
            </Text>
            <Text className={`text-xs ${STATUS_TONE[c.status] ?? 'text-muted-foreground'}`}>
              {c.status}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
