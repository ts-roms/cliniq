import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  clinicLabTreatmentPlansControllerDecide,
  clinicLabTreatmentPlansControllerList,
} from '@org/api-client';

interface TreatmentPlan {
  id: string;
  caseId: string;
  revision: number | null;
  title: string;
  summary: string;
  status: string;
  proposedAt: string | null;
  decidedAt: string | null;
  files: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    kind: string;
  }>;
  approvals: Array<{
    id: string;
    decision: string;
    notes: string | null;
    decidedAt: string;
  }>;
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'text-zinc-700',
  PROPOSED: 'text-blue-700',
  APPROVED: 'text-emerald-700',
  REJECTED: 'text-rose-700',
  REVISION_REQUESTED: 'text-amber-700',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PROPOSED: 'Awaiting decision',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REVISION_REQUESTED: 'Revision requested',
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function LabTreatmentPlansScreen({
  caseId,
  onBack,
}: {
  caseId: string;
  onBack: () => void;
}) {
  const list = useQuery({
    queryKey: ['lab', 'treatment-plans', 'mobile', caseId],
    queryFn: async (): Promise<TreatmentPlan[]> => {
      const { data, error } = await clinicLabTreatmentPlansControllerList({
        query: { caseId },
      });
      if (error || !data) throw new Error('Failed to load plans');
      return data as unknown as TreatmentPlan[];
    },
  });

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border bg-card px-6 pb-3 pt-4">
        <TouchableOpacity onPress={onBack} className="rounded-md border border-border px-2 py-1">
          <Text className="text-xs text-foreground">←</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground">Treatment plans</Text>
          <Text className="text-xs text-muted-foreground">Decide proposed plans here</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 py-4">
        {list.isLoading && <ActivityIndicator className="mt-6" />}
        {list.error && (
          <Text className="text-sm text-rose-700">{(list.error as Error).message}</Text>
        )}
        {!list.isLoading && list.data && list.data.length === 0 && (
          <Text className="mt-6 text-center text-sm text-muted-foreground">
            The lab hasn't proposed a treatment plan for this case yet.
          </Text>
        )}
        {list.data?.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </ScrollView>
    </View>
  );
}

function PlanCard({ plan }: { plan: TreatmentPlan }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: async (decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED') => {
      const { data, error } = await clinicLabTreatmentPlansControllerDecide({
        path: { id: plan.id },
        body: { decision, notes: notes.trim() || undefined } as never,
      });
      if (error) throw new Error('Failed to record decision');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab', 'treatment-plans'] });
      setNotes('');
      setBusy(null);
    },
    onError: (err) => {
      setBusy(null);
      Alert.alert('Error', (err as Error).message);
    },
  });

  function go(decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED') {
    setBusy(decision);
    decide.mutate(decision);
  }

  const canDecide = plan.status === 'PROPOSED';

  return (
    <View className="mb-3 overflow-hidden rounded-lg border border-border bg-card">
      <View className="border-b border-border px-4 py-3">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-base font-semibold text-foreground">{plan.title}</Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {plan.proposedAt
                ? `Proposed ${new Date(plan.proposedAt).toLocaleString()}`
                : 'Draft'}
              {plan.revision !== null && ` · rev ${plan.revision}`}
            </Text>
          </View>
          <Text className={`text-xs font-medium ${STATUS_TONE[plan.status] ?? ''}`}>
            {STATUS_LABEL[plan.status] ?? plan.status}
          </Text>
        </View>
      </View>

      <View className="px-4 py-3">
        <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Summary
        </Text>
        <Text className="mt-1 text-sm text-foreground">{plan.summary}</Text>
      </View>

      {plan.files.length > 0 && (
        <View className="border-t border-border px-4 py-3">
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Attached files
          </Text>
          {plan.files.map((f) => (
            <Text key={f.id} className="mt-1 text-xs text-foreground">
              · {f.filename}{' '}
              <Text className="text-muted-foreground">
                ({f.kind} · {humanSize(f.sizeBytes)})
              </Text>
            </Text>
          ))}
        </View>
      )}

      {canDecide && (
        <View className="border-t border-border bg-muted/20 px-4 py-3">
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Decision notes (optional)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. proceed with shade A2"
            multiline
            className="mt-1 min-h-[60px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholderTextColor="#999"
          />
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              onPress={() => go('APPROVED')}
              disabled={!!busy}
              className="flex-1 rounded-md bg-emerald-600 px-3 py-2.5"
            >
              <Text className="text-center text-sm font-medium text-white">
                {busy === 'APPROVED' ? '…' : 'Approve'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => go('REVISION_REQUESTED')}
              disabled={!!busy}
              className="flex-1 rounded-md border border-amber-500 px-3 py-2.5"
            >
              <Text className="text-center text-sm font-medium text-amber-700">
                {busy === 'REVISION_REQUESTED' ? '…' : 'Revise'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => go('REJECTED')}
              disabled={!!busy}
              className="flex-1 rounded-md border border-rose-500 px-3 py-2.5"
            >
              <Text className="text-center text-sm font-medium text-rose-700">
                {busy === 'REJECTED' ? '…' : 'Reject'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {plan.approvals.length > 0 && (
        <View className="border-t border-border px-4 py-3">
          <Text className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Decisions
          </Text>
          {plan.approvals.map((a) => (
            <View key={a.id} className="mt-1">
              <Text className="text-xs text-foreground">
                <Text className="font-medium">{a.decision.replace('_', ' ')}</Text> ·{' '}
                {new Date(a.decidedAt).toLocaleString()}
              </Text>
              {a.notes && (
                <Text className="text-xs text-muted-foreground">{a.notes}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
