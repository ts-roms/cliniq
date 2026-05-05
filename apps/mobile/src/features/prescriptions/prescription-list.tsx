import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';
import { prescriptionsControllerList } from '@org/api-client';

interface PrescriptionItem {
  drugName: string;
  strength: string | null;
  dose: string;
  frequency: string;
  duration: string | null;
}

interface Prescription {
  id: string;
  number: string;
  issuedAt: string;
  status: string;
  items: PrescriptionItem[];
}

const STATUS_TONE: Record<string, string> = {
  ISSUED: 'text-blue-700',
  DISPENSED: 'text-emerald-700',
  CANCELLED: 'text-zinc-500',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function PrescriptionList({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['prescriptions', 'patient', patientId],
    queryFn: async (): Promise<Prescription[]> => {
      const { data, error } = await prescriptionsControllerList({
        query: { patientId },
      });
      if (error || !data) throw new Error('Failed to load');
      return data as unknown as Prescription[];
    },
    enabled: !!patientId,
  });

  return (
    <View>
      {isLoading && <ActivityIndicator />}
      {error && (
        <Text className="text-xs text-destructive">
          {(error as Error).message}
        </Text>
      )}
      {data && data.length === 0 && (
        <Text className="text-xs text-muted-foreground">
          No prescriptions on file.
        </Text>
      )}
      {data?.slice(0, 10).map((rx) => (
        <View key={rx.id} className="border-b border-border py-2">
          <View className="flex-row items-center justify-between">
            <Text className="font-mono text-sm text-foreground">{rx.number}</Text>
            <Text className={`text-xs ${STATUS_TONE[rx.status] ?? ''}`}>
              {rx.status}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {formatDate(rx.issuedAt)}
          </Text>
          {rx.items.map((it, i) => (
            <Text key={i} className="text-xs text-foreground">
              • {it.drugName}
              {it.strength ? ` ${it.strength}` : ''} · {it.dose} · {it.frequency}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
