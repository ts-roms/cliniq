import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  clinicLabCasesControllerList,
  clinicLabInvoicesControllerList,
} from '@org/api-client';

interface CaseSummary {
  id: string;
  refNumber: number | null;
  status: string;
  urgency: string;
  patientLabel: string | null;
  createdAt: string;
  product?: { name: string };
  lab?: { name: string };
}

interface InvoiceSummary {
  id: string;
  refNumber: number | null;
  status: string;
  totalCents: number;
  paidCents: number;
  currency: string;
  dueAt: string | null;
  issuedAt: string | null;
  lab?: { name: string };
}

const CASE_TONE: Record<string, string> = {
  DRAFT: 'text-zinc-700',
  SUBMITTED: 'text-blue-700',
  IN_PROGRESS: 'text-indigo-700',
  AWAITING_PICKUP: 'text-amber-700',
  SHIPPED: 'text-cyan-700',
  DELIVERED: 'text-emerald-700',
  CANCELLED: 'text-zinc-500',
  REJECTED: 'text-rose-700',
};

const INVOICE_TONE: Record<string, string> = {
  DRAFT: 'text-zinc-700',
  ISSUED: 'text-blue-700',
  PAID: 'text-emerald-700',
  OVERDUE: 'text-rose-700',
  VOID: 'text-zinc-500',
};

function formatPhp(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function LabInboxScreen({
  onSelectCase,
  onSelectInvoice,
  onSelectPlansForCase,
}: {
  onSelectCase: (id: string) => void;
  onSelectInvoice: (id: string) => void;
  onSelectPlansForCase: (id: string) => void;
}) {
  const cases = useQuery({
    queryKey: ['lab', 'clinic-cases', 'mobile'],
    queryFn: async (): Promise<CaseSummary[]> => {
      const { data, error } = await clinicLabCasesControllerList();
      if (error || !data) throw new Error('Failed to load cases');
      return data as unknown as CaseSummary[];
    },
  });

  const invoices = useQuery({
    queryKey: ['lab', 'clinic-invoices', 'mobile'],
    queryFn: async (): Promise<InvoiceSummary[]> => {
      const { data, error } = await clinicLabInvoicesControllerList();
      if (error || !data) throw new Error('Failed to load invoices');
      return data as unknown as InvoiceSummary[];
    },
  });

  const refreshing = cases.isRefetching || invoices.isRefetching;
  function refresh() {
    void cases.refetch();
    void invoices.refetch();
  }

  // Surface what's actionable to a busy clinician: outstanding invoices and
  // cases not yet delivered. Everything else collapses into "All cases".
  const outstandingInvoices = (invoices.data ?? []).filter(
    (i) => i.status === 'ISSUED' || i.status === 'OVERDUE',
  );
  const activeCases = (cases.data ?? []).filter(
    (c) =>
      c.status === 'IN_PROGRESS' ||
      c.status === 'AWAITING_PICKUP' ||
      c.status === 'SHIPPED' ||
      c.status === 'SUBMITTED',
  );

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border bg-card px-6 pb-3 pt-4">
        <Text className="text-xs uppercase tracking-widest text-primary">ClinIQ</Text>
        <Text className="text-xl font-semibold text-foreground">Lab</Text>
        <Text className="text-xs text-muted-foreground">
          Cases, invoices and treatment plans from your associated labs.
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {/* Outstanding invoices */}
        <Section title="Outstanding invoices">
          {invoices.isLoading && <ActivityIndicator className="my-4" />}
          {invoices.error && <ErrorRow message={(invoices.error as Error).message} />}
          {!invoices.isLoading && outstandingInvoices.length === 0 && (
            <EmptyRow message="Nothing outstanding." />
          )}
          {outstandingInvoices.map((inv) => (
            <TouchableOpacity
              key={inv.id}
              onPress={() => onSelectInvoice(inv.id)}
              className="border-b border-border bg-card px-4 py-3"
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-sm text-foreground">
                  {inv.refNumber !== null ? `INV-${inv.refNumber}` : 'Draft'}
                </Text>
                <Text className={`text-xs font-medium ${INVOICE_TONE[inv.status] ?? ''}`}>
                  {inv.status}
                </Text>
              </View>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {inv.lab?.name ?? '—'} ·{' '}
                {formatPhp(inv.totalCents - inv.paidCents, inv.currency)} due
                {inv.dueAt ? ` by ${new Date(inv.dueAt).toLocaleDateString()}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </Section>

        {/* Active cases */}
        <Section title="Active cases">
          {cases.isLoading && <ActivityIndicator className="my-4" />}
          {cases.error && <ErrorRow message={(cases.error as Error).message} />}
          {!cases.isLoading && activeCases.length === 0 && (
            <EmptyRow message="No cases in flight." />
          )}
          {activeCases.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => onSelectCase(c.id)}
              className="border-b border-border bg-card px-4 py-3"
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-sm text-foreground">
                  {c.refNumber !== null ? `#${c.refNumber}` : c.id.slice(-6)}
                </Text>
                <View className="flex-row items-center gap-2">
                  {c.urgency === 'URGENT' && (
                    <Text className="text-xs font-semibold text-amber-700">URGENT</Text>
                  )}
                  <Text className={`text-xs font-medium ${CASE_TONE[c.status] ?? ''}`}>
                    {c.status.replace('_', ' ')}
                  </Text>
                </View>
              </View>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {c.product?.name ?? '—'} · {c.lab?.name ?? '—'}
                {c.patientLabel ? ` · ${c.patientLabel}` : ''} · {timeAgo(c.createdAt)}
              </Text>
              <TouchableOpacity
                onPress={() => onSelectPlansForCase(c.id)}
                className="mt-2 self-start rounded-md bg-primary/10 px-2 py-0.5"
              >
                <Text className="text-[11px] text-primary">View plans →</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-3">
      <Text className="px-6 pb-1 pt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <View className="px-6 py-3">
      <Text className="text-sm text-muted-foreground">{message}</Text>
    </View>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <View className="px-6 py-3">
      <Text className="text-sm text-rose-700">{message}</Text>
    </View>
  );
}
