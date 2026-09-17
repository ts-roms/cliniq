import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { clinicLabInvoicesControllerFindOne } from '@org/api-client';

interface InvoiceDetail {
  id: string;
  refNumber: number | null;
  status: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  notes: string | null;
  lab?: { name: string };
  items: Array<{
    id: string;
    description: string;
    qty: number;
    unitPriceCents: number;
    amountCents: number;
  }>;
  paymentLinks: Array<{
    id: string;
    provider: string;
    status: string;
    url: string | null;
    amountCents: number;
  }>;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'text-zinc-700',
  ISSUED: 'text-blue-700',
  PAID: 'text-emerald-700',
  OVERDUE: 'text-rose-700',
  VOID: 'text-zinc-500',
};

function fmt(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export function LabInvoiceDetailScreen({
  invoiceId,
  onBack,
}: {
  invoiceId: string;
  onBack: () => void;
}) {
  const detail = useQuery({
    queryKey: ['lab', 'clinic-invoice', invoiceId],
    queryFn: async (): Promise<InvoiceDetail> => {
      const { data, error } = await clinicLabInvoicesControllerFindOne({
        path: { id: invoiceId },
      });
      if (error || !data) throw new Error('Failed to load invoice');
      return data as unknown as InvoiceDetail;
    },
  });

  if (detail.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-rose-700">
          {(detail.error as Error)?.message ?? 'Not found'}
        </Text>
        <TouchableOpacity onPress={onBack} className="mt-3">
          <Text className="text-primary">Back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const inv = detail.data;
  const ref = inv.refNumber !== null ? `INV-${inv.refNumber}` : '—';
  const outstanding = inv.totalCents - inv.paidCents;
  const pendingLinks = inv.paymentLinks.filter((l) => l.status === 'PENDING');

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border bg-card px-6 pb-3 pt-4">
        <TouchableOpacity onPress={onBack} className="rounded-md border border-border px-2 py-1">
          <Text className="text-xs text-foreground">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground">Invoice {ref}</Text>
          <Text className="text-xs text-muted-foreground">{inv.lab?.name ?? '—'}</Text>
        </View>
        <Text className={`text-xs font-medium ${STATUS_TONE[inv.status] ?? ''}`}>
          {inv.status}
        </Text>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        <View className="rounded-md border border-border bg-card px-4 py-3">
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Outstanding
          </Text>
          <Text className="text-2xl font-semibold text-amber-700">
            {fmt(outstanding, inv.currency)}
          </Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-xs text-muted-foreground">
              Total {fmt(inv.totalCents, inv.currency)}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Paid {fmt(inv.paidCents, inv.currency)}
            </Text>
          </View>
        </View>

        <View className="mt-4 rounded-md border border-border bg-card">
          <Row label="Issued" value={inv.issuedAt ? new Date(inv.issuedAt).toLocaleString() : '—'} />
          <Row label="Due" value={inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : '—'} />
          <Row label="Paid" value={inv.paidAt ? new Date(inv.paidAt).toLocaleString() : '—'} />
        </View>

        {inv.notes && (
          <View className="mt-4 rounded-md border border-border bg-card px-4 py-3">
            <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Notes
            </Text>
            <Text className="mt-1 text-sm text-foreground">{inv.notes}</Text>
          </View>
        )}

        <View className="mt-4">
          <Text className="mb-1 px-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            Line items
          </Text>
          <View className="rounded-md border border-border bg-card">
            {inv.items.map((it) => (
              <View key={it.id} className="border-b border-border px-3 py-2">
                <Text className="text-sm text-foreground">{it.description}</Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {it.qty} × {fmt(it.unitPriceCents, inv.currency)} ={' '}
                  {fmt(it.amountCents, inv.currency)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {pendingLinks.length > 0 && (
          <View className="mt-4">
            <Text className="mb-1 px-1 text-[11px] uppercase tracking-widest text-muted-foreground">
              Pay this invoice
            </Text>
            {pendingLinks.map((l) => (
              <TouchableOpacity
                key={l.id}
                disabled={!l.url}
                onPress={() => l.url && Linking.openURL(l.url)}
                className="mt-2 rounded-md border border-primary bg-primary/10 px-4 py-3"
              >
                <Text className="text-sm font-medium text-primary">
                  Pay {fmt(l.amountCents, inv.currency)} via {l.provider}
                </Text>
                {!l.url && (
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    Coordinate offline with the lab.
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View className="h-6" />
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-sm text-foreground">{value}</Text>
    </View>
  );
}
