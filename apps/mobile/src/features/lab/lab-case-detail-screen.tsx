import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  clinicLabCasesControllerFindOne,
  clinicLabCasesControllerListPhases,
} from '@org/api-client';

interface LabCaseDetail {
  id: string;
  refNumber: number | null;
  status: string;
  urgency: string;
  patientLabel: string | null;
  doctorLabel: string | null;
  notes: string | null;
  createdAt: string;
  submittedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  product: { name: string; phases?: string[] };
  lab?: { name: string };
}

interface PhaseEvent {
  id: string;
  phase: string;
  enteredAt: string;
  exitedAt: string | null;
  notes: string | null;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'text-zinc-700',
  SUBMITTED: 'text-blue-700',
  IN_PROGRESS: 'text-indigo-700',
  AWAITING_PICKUP: 'text-amber-700',
  SHIPPED: 'text-cyan-700',
  DELIVERED: 'text-emerald-700',
  CANCELLED: 'text-zinc-500',
  REJECTED: 'text-rose-700',
};

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export function LabCaseDetailScreen({
  caseId,
  onBack,
  onViewPlans,
}: {
  caseId: string;
  onBack: () => void;
  onViewPlans: () => void;
}) {
  const detail = useQuery({
    queryKey: ['lab', 'clinic-case', caseId],
    queryFn: async (): Promise<LabCaseDetail> => {
      const { data, error } = await clinicLabCasesControllerFindOne({
        path: { id: caseId },
      });
      if (error || !data) throw new Error('Failed to load case');
      return data as unknown as LabCaseDetail;
    },
  });

  const phases = useQuery({
    queryKey: ['lab', 'clinic-case-phases', caseId],
    queryFn: async (): Promise<PhaseEvent[]> => {
      const { data, error } = await clinicLabCasesControllerListPhases({
        path: { id: caseId },
      });
      if (error || !data) return [];
      return data as unknown as PhaseEvent[];
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
  const c = detail.data;
  const ref = c.refNumber !== null ? `#${c.refNumber}` : c.id.slice(-6);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border bg-card px-6 pb-3 pt-4">
        <TouchableOpacity onPress={onBack} className="rounded-md border border-border px-2 py-1">
          <Text className="text-xs text-foreground">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground">Case {ref}</Text>
          <Text className="text-xs text-muted-foreground">
            {c.product.name} · {c.lab?.name ?? '—'}
          </Text>
        </View>
        <Text className={`text-xs font-medium ${STATUS_TONE[c.status] ?? ''}`}>
          {c.status.replace('_', ' ')}
        </Text>
      </View>

      <ScrollView className="flex-1 px-6 py-4">
        <Section title="Details">
          <Row label="Patient" value={c.patientLabel ?? '—'} />
          <Row label="Doctor" value={c.doctorLabel ?? '—'} />
          <Row label="Urgency" value={c.urgency} />
          {c.notes && <Row label="Notes" value={c.notes} multiline />}
        </Section>

        <Section title="Timeline">
          <Row label="Submitted" value={fmt(c.submittedAt)} />
          <Row label="Accepted" value={fmt(c.acceptedAt)} />
          <Row label="Completed" value={fmt(c.completedAt)} />
          <Row label="Shipped" value={fmt(c.shippedAt)} />
          <Row label="Delivered" value={fmt(c.deliveredAt)} />
        </Section>

        {phases.data && phases.data.length > 0 && (
          <Section title="Manufacturing phases">
            {phases.data.map((p) => (
              <View key={p.id} className="border-b border-border py-2">
                <Text className="text-sm text-foreground">{p.phase}</Text>
                <Text className="text-xs text-muted-foreground">
                  {fmt(p.enteredAt)}
                  {p.exitedAt ? ` → ${fmt(p.exitedAt)}` : ' → ongoing'}
                </Text>
                {p.notes && (
                  <Text className="mt-0.5 text-xs text-muted-foreground">{p.notes}</Text>
                )}
              </View>
            ))}
          </Section>
        )}

        <View className="my-6">
          <TouchableOpacity
            onPress={onViewPlans}
            className="rounded-md bg-primary px-4 py-3"
          >
            <Text className="text-center font-medium text-primary-foreground">
              View treatment plans
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">
        {title}
      </Text>
      <View className="rounded-md border border-border bg-card">{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View
      className={`border-b border-border px-3 ${multiline ? 'py-2' : 'flex-row items-center justify-between py-2'}`}
    >
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text
        className={`text-sm text-foreground ${multiline ? 'mt-1' : 'flex-1 text-right'}`}
      >
        {value}
      </Text>
    </View>
  );
}
