import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { appointmentsControllerList } from '@org/api-client';

interface Appt {
  id: string;
  startsAt: string;
  endsAt: string;
  type: string;
  status: string;
  reason: string | null;
  patient?: { firstName: string; lastName: string; mrn: string };
}

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  CHECKED_IN: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-zinc-200 text-zinc-700',
  NO_SHOW: 'bg-rose-100 text-rose-800',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayBounds(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function ScheduleScreen() {
  const [date, setDate] = useState(todayIso());
  const { from, to } = dayBounds(date);
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['appointments', 'mobile', from, to],
    queryFn: async (): Promise<Appt[]> => {
      const { data, error } = await appointmentsControllerList({
        query: { from, to },
      });
      if (error || !data) throw new Error('Failed to load schedule');
      return data as unknown as Appt[];
    },
    placeholderData: (prev) => prev,
  });

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border bg-card px-6 pb-3 pt-4">
        <Text className="text-xs uppercase tracking-widest text-primary">Schedule</Text>
        <Text className="text-xl font-semibold text-foreground">
          {formatDateLabel(date)} · {data ? `${data.length}` : '…'}
        </Text>
        <View className="mt-2 flex-row gap-2">
          <DayChip label="‹ Prev" onPress={() => setDate(shiftIso(date, -1))} />
          <DayChip label="Today" onPress={() => setDate(todayIso())} primary />
          <DayChip label="Next ›" onPress={() => setDate(shiftIso(date, 1))} />
        </View>
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
          keyExtractor={(a) => a.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="px-6 py-8 text-center text-sm text-muted-foreground">
              No appointments scheduled for {formatDateLabel(date)}.
            </Text>
          }
          renderItem={({ item }) => <ApptRow appt={item} />}
        />
      )}
    </View>
  );
}

function DayChip({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`rounded-full px-3 py-1 ${
        primary ? 'bg-primary' : 'border border-border bg-card'
      }`}
    >
      <Text
        className={`text-xs ${primary ? 'text-primary-foreground' : 'text-foreground'}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ApptRow({ appt }: { appt: Appt }) {
  const tone = STATUS_TONE[appt.status] ?? 'bg-zinc-200 text-zinc-700';
  return (
    <View className="border-b border-border px-6 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-sm text-foreground">
          {formatTime(appt.startsAt)} – {formatTime(appt.endsAt)}
        </Text>
        <View className={`rounded-full px-2 py-0.5 ${tone.split(' ')[0]}`}>
          <Text className={`text-xs ${tone.split(' ')[1]}`}>
            {appt.status.replace('_', ' ')}
          </Text>
        </View>
      </View>
      <Text className="mt-1 text-base text-foreground">
        {appt.patient
          ? `${appt.patient.lastName}, ${appt.patient.firstName}`
          : 'Patient'}
        {appt.patient && (
          <Text className="text-xs text-muted-foreground"> · {appt.patient.mrn}</Text>
        )}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {appt.type}
        {appt.reason ? ` · ${appt.reason}` : ''}
      </Text>
    </View>
  );
}
