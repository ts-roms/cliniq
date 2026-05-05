import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { meControllerRecords } from '@org/api-client';
import { useT } from '../../shared/i18n';

interface Records {
  allergies: Array<{ id: string; substance: string; severity: string; reaction: string | null }>;
  medications: Array<{
    id: string;
    drugName: string;
    dose: string | null;
    frequency: string | null;
    status: string;
  }>;
  conditions: Array<{
    id: string;
    name: string;
    icd10Code: string | null;
    status: string;
  }>;
  labOrders: Array<{
    id: string;
    number: string;
    status: string;
    createdAt: string;
    items: Array<{
      id: string;
      testName: string;
      resultValue: string | null;
      resultUnit: string | null;
      abnormalFlag:
        | 'NORMAL'
        | 'HIGH'
        | 'LOW'
        | 'CRITICAL_HIGH'
        | 'CRITICAL_LOW'
        | 'ABNORMAL'
        | null;
    }>;
  }>;
}

const FLAG_TONE: Record<string, string> = {
  NORMAL: 'text-emerald-700',
  HIGH: 'text-amber-700',
  LOW: 'text-amber-700',
  CRITICAL_HIGH: 'text-rose-700 font-semibold',
  CRITICAL_LOW: 'text-rose-700 font-semibold',
  ABNORMAL: 'text-rose-700',
};

const SEV_TONE: Record<string, string> = {
  MILD: 'text-emerald-700',
  MODERATE: 'text-amber-700',
  SEVERE: 'text-rose-700',
};

export function PortalRecordsScreen() {
  const t = useT();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['me', 'records'],
    queryFn: async (): Promise<Records | null> => {
      const { data, error } = await meControllerRecords();
      if (error || !data) return null;
      return data as unknown as Records;
    },
  });

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
    >
      <View className="border-b border-border bg-card px-6 pb-3 pt-4">
        <Text className="text-xs uppercase tracking-widest text-primary">
          {t('app.brand')}
        </Text>
        <Text className="text-xl font-semibold text-foreground">
          {t('portal.tabs.records')}
        </Text>
      </View>

      {isLoading && (
        <View className="px-6 py-6">
          <ActivityIndicator />
        </View>
      )}
      {error && (
        <View className="px-6 py-4">
          <Text className="text-sm text-destructive">{(error as Error).message}</Text>
        </View>
      )}
      {data && (
        <>
          <Section title={t('portal.records.allergies')}>
            {data.allergies.length === 0 ? (
              <Text className="text-xs text-muted-foreground">—</Text>
            ) : (
              data.allergies.map((a) => (
                <Text key={a.id} className="text-sm text-foreground">
                  • {a.substance}{' '}
                  <Text className={`text-xs ${SEV_TONE[a.severity] ?? ''}`}>
                    ({a.severity})
                  </Text>
                </Text>
              ))
            )}
          </Section>

          <Section title={t('portal.records.medications')}>
            {data.medications.length === 0 ? (
              <Text className="text-xs text-muted-foreground">—</Text>
            ) : (
              data.medications.map((m) => (
                <Text key={m.id} className="text-sm text-foreground">
                  • {m.drugName}
                  {m.dose ? ` ${m.dose}` : ''}
                  {m.frequency ? ` · ${m.frequency}` : ''}{' '}
                  <Text className="text-xs text-muted-foreground">({m.status})</Text>
                </Text>
              ))
            )}
          </Section>

          <Section title={t('portal.records.conditions')}>
            {data.conditions.length === 0 ? (
              <Text className="text-xs text-muted-foreground">—</Text>
            ) : (
              data.conditions.map((c) => (
                <Text key={c.id} className="text-sm text-foreground">
                  • {c.name}{' '}
                  {c.icd10Code && (
                    <Text className="text-xs font-mono text-muted-foreground">
                      {c.icd10Code}
                    </Text>
                  )}
                </Text>
              ))
            )}
          </Section>

          <Section title={t('portal.records.labs')}>
            {data.labOrders.length === 0 ? (
              <Text className="text-xs text-muted-foreground">
                {t('portal.empty.records')}
              </Text>
            ) : (
              data.labOrders.map((order) => (
                <View key={order.id} className="mt-2">
                  <Text className="font-mono text-xs text-muted-foreground">
                    {order.number} · {order.status}
                  </Text>
                  {order.items.map((it) => (
                    <View key={it.id} className="ml-2 flex-row justify-between">
                      <Text className="text-sm text-foreground">{it.testName}</Text>
                      <Text
                        className={`font-mono text-xs ${
                          it.abnormalFlag ? FLAG_TONE[it.abnormalFlag] : ''
                        }`}
                      >
                        {it.resultValue
                          ? `${it.resultValue}${it.resultUnit ? ` ${it.resultUnit}` : ''}`
                          : 'pending'}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </Section>

          <View className="px-6 py-4">
            <Text className="text-xs italic text-muted-foreground">
              {t('portal.disclaimer')}
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="border-b border-border bg-card px-6 py-3">
      <Text className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}
