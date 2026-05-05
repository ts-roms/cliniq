import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { billingControllerListInvoices } from '@org/api-client';
import { getSession } from '../auth/session';
import { formatCentavos } from './money';

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

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function InvoiceList({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices', 'patient', patientId],
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await billingControllerListInvoices({
        query: { patientId },
      });
      if (error || !data) throw new Error('Failed to load invoices');
      return data as unknown as Invoice[];
    },
    enabled: !!patientId,
  });

  // Open the PDF in the device's browser. Fetch with auth, share via Linking
  // (iOS Safari / Android Chrome both render application/pdf inline).
  const pdf = useMutation({
    mutationFn: async (invoiceId: string) => {
      const token = getSession()?.accessToken;
      if (!token) throw new Error('not signed in');
      const res = await fetch(`${API_BASE}/api/invoices/${invoiceId}/pdf`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      // RN's fetch can't directly trigger the OS PDF viewer, so open the
      // authenticated URL via the device browser. Server treats `?token=` as
      // an alternative to the Bearer header — but we don't support that yet,
      // so for v1 we surface a "preview not yet available on mobile" hint.
      Alert.alert(
        'PDF generated',
        'Direct PDF preview on mobile is coming soon. Open this invoice on the web app to download.',
      );
      return { invoiceId };
    },
    onError: (err) => {
      Alert.alert('Error', (err as Error).message);
    },
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
        <Text className="text-xs text-muted-foreground">No invoices yet.</Text>
      )}
      {data?.map((inv) => {
        const remaining = Math.max(inv.totalCentavos - inv.paidCentavos, 0);
        return (
          <View key={inv.id} className="border-b border-border py-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-mono text-sm text-foreground">{inv.number}</Text>
              <Text className={`text-xs ${STATUS_TONE[inv.status] ?? ''}`}>
                {inv.status}
              </Text>
            </View>
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-xs text-muted-foreground">
                {formatDate(inv.issuedAt)} ·{' '}
                {formatCentavos(inv.totalCentavos, inv.currency)}
              </Text>
              {remaining > 0 ? (
                <Text className="text-xs font-semibold text-foreground">
                  {formatCentavos(remaining, inv.currency)} due
                </Text>
              ) : (
                <Text className="text-xs text-emerald-700">paid</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                // For now route to the device browser to open the web app —
                // it has a working blob-download path with auth.
                void Linking.openURL(`${API_BASE.replace(/\/api$/, '')}/patients/${patientId}`);
                pdf.mutate(inv.id);
              }}
              className="mt-1 self-end"
            >
              <Text className="text-xs text-primary">Open in web</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
