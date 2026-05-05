import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { patientsControllerList } from '@org/api-client';
import { clearSession } from '../auth/session';

interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  sex: string;
}

interface PatientList {
  items: Patient[];
  total: number;
}

export function PatientsScreen({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['patients', 'mobile'],
    queryFn: async (): Promise<PatientList> => {
      const { data, error } = await patientsControllerList({
        query: { limit: 50 },
      });
      if (error || !data) throw new Error('Failed to load');
      return data as unknown as PatientList;
    },
  });

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border bg-card px-6 pb-3 pt-4">
        <View>
          <Text className="text-xs uppercase tracking-widest text-primary">ClinIQ</Text>
          <Text className="text-xl font-semibold text-foreground">
            Patients{data ? ` · ${data.total}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => clearSession()}
          className="rounded-md border border-border px-3 py-1.5"
        >
          <Text className="text-xs text-foreground">Sign out</Text>
        </TouchableOpacity>
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
          data={data.items}
          keyExtractor={(p) => p.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text className="px-6 py-8 text-center text-sm text-muted-foreground">
              No patients yet.
            </Text>
          }
          renderItem={({ item }) => (
            <PatientRow patient={item} onPress={() => onSelect(item.id)} />
          )}
        />
      )}
    </View>
  );
}

function PatientRow({
  patient,
  onPress,
}: {
  patient: Patient;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="border-b border-border px-6 py-3 active:bg-muted"
    >
      <Text className="text-base font-medium text-foreground">
        {patient.lastName}, {patient.firstName}
      </Text>
      <Text className="text-xs text-muted-foreground">
        MRN <Text className="font-mono">{patient.mrn}</Text> · {patient.sex}
      </Text>
    </TouchableOpacity>
  );
}
