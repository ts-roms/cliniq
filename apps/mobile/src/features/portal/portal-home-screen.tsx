import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
  meControllerAppointments,
  meControllerInvoices,
  meControllerProfile,
  meControllerTeleActive,
} from '@org/api-client';
import { formatCentavos } from '../billing/money';
import { clearSession } from '../auth/session';
import { openTeleSession } from '../tele/open-tele';
import { useT } from '../../shared/i18n';

interface ActiveTele {
  id: string;
  status: string;
  providerName: string | null;
  joinUrl: string;
}

interface Profile {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
}

interface Appt {
  id: string;
  startsAt: string;
  type: string;
  reason: string | null;
}

interface Invoice {
  id: string;
  totalCentavos: number;
  paidCentavos: number;
  status: string;
  currency?: string;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PortalHomeScreen() {
  const t = useT();
  const profile = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await meControllerProfile();
      if (error || !data) return null;
      return data as unknown as Profile;
    },
  });
  const appts = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: async (): Promise<Appt[]> => {
      const { data, error } = await meControllerAppointments();
      if (error || !data) return [];
      return data as unknown as Appt[];
    },
  });
  const invoices = useQuery({
    queryKey: ['me', 'invoices'],
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await meControllerInvoices();
      if (error || !data) return [];
      return data as unknown as Invoice[];
    },
  });
  const tele = useQuery({
    queryKey: ['me', 'tele', 'active'],
    refetchInterval: 30_000, // session may go ACTIVE while the user is on this screen
    queryFn: async (): Promise<ActiveTele | null> => {
      const { data } = await meControllerTeleActive();
      return (data as unknown as ActiveTele) ?? null;
    },
  });

  const upcoming = appts.data
    ?.filter((a) => new Date(a.startsAt) >= new Date())
    .slice(0, 3);

  const outstanding =
    invoices.data?.reduce(
      (sum, inv) =>
        inv.status === 'PAID' || inv.status === 'CANCELLED'
          ? sum
          : sum + Math.max(inv.totalCentavos - inv.paidCentavos, 0),
      0,
    ) ?? 0;

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border bg-card px-6 pb-3 pt-4">
        <View>
          <Text className="text-xs uppercase tracking-widest text-primary">
            {t('app.brand')}
          </Text>
          <Text className="text-xl font-semibold text-foreground">
            {t('portal.welcome')}
            {profile.data ? `, ${profile.data.firstName}` : ''}
          </Text>
          {profile.data && (
            <Text className="text-xs text-muted-foreground">
              MRN <Text className="font-mono">{profile.data.mrn}</Text>
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => clearSession()}
          className="rounded-md border border-border px-3 py-1.5"
        >
          <Text className="text-xs text-foreground">{t('common.signout')}</Text>
        </TouchableOpacity>
      </View>

      {tele.data && (
        <View className="border-b border-border bg-primary/10 px-6 py-3">
          <Text className="text-xs uppercase tracking-wide text-primary">
            Video visit ready
          </Text>
          <Text className="mt-1 text-sm text-foreground">
            {tele.data.providerName
              ? `Dr. ${tele.data.providerName.replace(/^Dr\.?\s*/i, '')}`
              : 'Your provider'}{' '}
            is waiting for you.
          </Text>
          <TouchableOpacity
            onPress={() => {
              void openTeleSession(tele.data!.joinUrl);
            }}
            className="mt-2 self-start rounded-md bg-primary px-4 py-2"
          >
            <Text className="text-xs font-medium text-primary-foreground">
              Join video visit
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="border-b border-border bg-card px-6 py-3">
        <Text className="text-xs uppercase tracking-wide text-muted-foreground">
          Upcoming
        </Text>
        {profile.isLoading || appts.isLoading ? (
          <ActivityIndicator />
        ) : !upcoming || upcoming.length === 0 ? (
          <Text className="mt-1 text-xs text-muted-foreground">
            {t('portal.empty.appointments')}
          </Text>
        ) : (
          upcoming.map((a) => (
            <View key={a.id} className="mt-1">
              <Text className="text-sm text-foreground">{formatDateTime(a.startsAt)}</Text>
              <Text className="text-xs text-muted-foreground">
                {a.type}
                {a.reason ? ` · ${a.reason}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <View className="border-b border-border bg-card px-6 py-3">
        <Text className="text-xs uppercase tracking-wide text-muted-foreground">
          Balance
        </Text>
        <Text className="mt-1 text-2xl font-semibold text-foreground">
          {formatCentavos(outstanding, invoices.data?.[0]?.currency)}
        </Text>
        <Text className="text-xs text-muted-foreground">across unpaid invoices</Text>
      </View>
    </ScrollView>
  );
}
