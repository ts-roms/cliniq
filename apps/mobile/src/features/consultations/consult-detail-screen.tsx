import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  consultationsControllerComplete,
  consultationsControllerFindOne,
  consultationsControllerGenerateSoap,
  consultationsControllerListSuggestions,
} from '@org/api-client';

interface Consultation {
  id: string;
  patientId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  subjective: { chiefComplaint?: string } | null;
  assessment: Array<{ problem?: string }> | null;
  plan: Array<{ problem?: string; actions?: string[] }> | null;
}

interface Suggestion {
  id: string;
  kind: string;
  status: string;
  draftJson: {
    subjective?: { chiefComplaint?: string };
    assessment?: Array<{ problem?: string; reasoning?: string }>;
    plan?: Array<{ problem?: string; actions?: string[] }>;
    uncertainty?: string[];
  };
  createdAt: string;
}

export function ConsultDetailScreen({
  consultId,
  onBack,
}: {
  consultId: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [transcript, setTranscript] = useState('');

  const consult = useQuery({
    queryKey: ['consult', consultId],
    queryFn: async (): Promise<Consultation> => {
      const { data, error } = await consultationsControllerFindOne({
        path: { id: consultId },
      });
      if (error || !data) throw new Error('Not found');
      return data as unknown as Consultation;
    },
  });

  const suggestions = useQuery({
    queryKey: ['consult', consultId, 'suggestions'],
    queryFn: async (): Promise<Suggestion[]> => {
      const { data, error } = await consultationsControllerListSuggestions({
        path: { id: consultId },
      });
      if (error || !data) return [];
      return data as unknown as Suggestion[];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { error } = await consultationsControllerGenerateSoap({
        path: { id: consultId },
        body: { transcript },
      });
      if (error) throw new Error('Generation failed');
    },
    onSuccess: () => {
      setTranscript('');
      qc.invalidateQueries({ queryKey: ['consult', consultId, 'suggestions'] });
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await consultationsControllerComplete({
        path: { id: consultId },
      });
      if (error) throw new Error('Complete failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consult', consultId] });
    },
  });

  if (consult.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }
  if (consult.error || !consult.data) {
    return (
      <View className="flex-1 bg-background px-6 py-8">
        <TouchableOpacity onPress={onBack}>
          <Text className="text-sm text-primary">‹ Back</Text>
        </TouchableOpacity>
        <Text className="mt-4 text-sm text-destructive">
          {(consult.error as Error)?.message ?? 'Not found'}
        </Text>
      </View>
    );
  }

  const c = consult.data;
  const locked = c.status === 'COMPLETED';
  const latest = suggestions.data?.[0];

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="border-b border-border bg-card px-6 pb-3 pt-4">
        <TouchableOpacity onPress={onBack}>
          <Text className="text-sm text-primary">‹ Patient</Text>
        </TouchableOpacity>
        <Text className="mt-2 text-xl font-semibold text-foreground">
          Consultation
        </Text>
        <Text className="text-xs text-muted-foreground">
          {c.status} · started {new Date(c.startedAt).toLocaleString()}
        </Text>
      </View>

      <View className="border-b border-border bg-card px-6 py-3">
        <Text className="text-xs uppercase tracking-wide text-muted-foreground">
          AI scribe
        </Text>
        {locked ? (
          <Text className="mt-2 text-xs text-muted-foreground">
            Consultation completed — SOAP edits locked.
          </Text>
        ) : (
          <>
            <TextInput
              multiline
              numberOfLines={6}
              value={transcript}
              onChangeText={setTranscript}
              placeholder="Paste/dictate your note. AI will draft a SOAP from it."
              placeholderTextColor="#999"
              className="mt-2 min-h-[120px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              style={{ textAlignVertical: 'top' }}
            />
            <TouchableOpacity
              onPress={() => generate.mutate()}
              disabled={!transcript.trim() || generate.isPending}
              className={`mt-2 rounded-md px-3 py-2 ${
                transcript.trim() && !generate.isPending ? 'bg-primary' : 'bg-primary/40'
              }`}
            >
              <Text className="text-center text-xs font-medium text-primary-foreground">
                {generate.isPending ? 'Generating…' : 'Generate SOAP draft'}
              </Text>
            </TouchableOpacity>
            {generate.error && (
              <Text className="mt-1 text-xs text-destructive">
                {(generate.error as Error).message}
              </Text>
            )}
          </>
        )}
      </View>

      {latest && (
        <View className="border-b border-border bg-card px-6 py-3">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">
            Latest draft · {latest.status}
          </Text>
          {latest.draftJson.subjective?.chiefComplaint && (
            <View className="mt-2">
              <Text className="text-xs text-muted-foreground">Subjective</Text>
              <Text className="text-sm text-foreground">
                {latest.draftJson.subjective.chiefComplaint}
              </Text>
            </View>
          )}
          {latest.draftJson.assessment && latest.draftJson.assessment.length > 0 && (
            <View className="mt-2">
              <Text className="text-xs text-muted-foreground">Assessment</Text>
              {latest.draftJson.assessment.map((a, i) => (
                <Text key={i} className="text-sm text-foreground">
                  • {a.problem ?? '—'}
                </Text>
              ))}
            </View>
          )}
          {latest.draftJson.plan && latest.draftJson.plan.length > 0 && (
            <View className="mt-2">
              <Text className="text-xs text-muted-foreground">Plan</Text>
              {latest.draftJson.plan.map((p, i) => (
                <Text key={i} className="text-sm text-foreground">
                  • {p.problem ?? '—'}{p.actions?.length ? ` — ${p.actions.join(', ')}` : ''}
                </Text>
              ))}
            </View>
          )}
          {latest.draftJson.uncertainty && latest.draftJson.uncertainty.length > 0 && (
            <View className="mt-2">
              <Text className="text-xs text-amber-700">
                Uncertainty: {latest.draftJson.uncertainty.join('; ')}
              </Text>
            </View>
          )}
        </View>
      )}

      {!locked && (
        <View className="px-6 py-4">
          <TouchableOpacity
            onPress={() => complete.mutate()}
            disabled={complete.isPending}
            className="rounded-md border border-border bg-card px-3 py-2"
          >
            <Text className="text-center text-sm text-foreground">
              {complete.isPending ? 'Completing…' : 'Mark complete'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
