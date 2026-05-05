import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { meControllerInvoices } from '@org/api-client';
import { formatCentavos } from '../billing/money';
import { useT } from '../../shared/i18n';

interface Invoice {
  id: string;
  number: string;
  status: string;
  totalCentavos: number;
  paidCentavos: number;
  currency?: string;
  issuedAt: string;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'text-zinc-700',
  SENT: 'text-blue-700',
  PARTIAL: 'text-amber-700',
  PAID: 'text-emerald-700',
  OVERDUE: 'text-rose-700',
  CANCELLED: 'text-zinc-500',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function PortalInvoicesScreen() {
  const t = useT();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['me', 'invoices'],
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await meControllerInvoices();
      if (error || !data) throw new Error('Failed to load');
      return data as unknown as Invoice[];
    },
  });

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border bg-card px-6 pb-3 pt-4">
        <Text className="text-xs uppercase tracking-widest text-primary">
          {t('app.brand')}
        </Text>
        <Text className="text-xl font-semibold text-foreground">
          {t('portal.tabs.invoices')}
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
          keyExtractor={(i) => i.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="px-6 py-8 text-center text-sm text-muted-foreground">
              {t('portal.empty.invoices')}
            </Text>
          }
          renderItem={({ item }) => {
            const remaining = Math.max(item.totalCentavos - item.paidCentavos, 0);
            return (
              <View className="border-b border-border px-6 py-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-mono text-sm text-foreground">{item.number}</Text>
                  <Text className={`text-xs ${STATUS_TONE[item.status] ?? ''}`}>
                    {item.status}
                  </Text>
                </View>
                <Text className="text-xs text-muted-foreground">
                  {formatDate(item.issuedAt)} ·{' '}
                  {formatCentavos(item.totalCentavos, item.currency)}
                </Text>
                {remaining > 0 ? (
                  <Text className="mt-1 text-sm font-semibold text-foreground">
                    {formatCentavos(remaining, item.currency)} due
                  </Text>
                ) : (
                  <Text className="mt-1 text-xs text-emerald-700">paid</Text>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
