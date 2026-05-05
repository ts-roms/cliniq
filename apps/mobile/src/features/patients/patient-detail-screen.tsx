import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  clinicalControllerListAllergies,
  clinicalControllerListConditions,
  clinicalControllerListMeds,
  clinicalControllerListVitals,
  patientsControllerFindOne,
} from '@org/api-client';
import { ConsultList } from '../consultations/consult-list';
import { PrescriptionList } from '../prescriptions/prescription-list';
import { InvoiceList } from '../billing/invoice-list';

interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  email: string | null;
  phone: string | null;
}

interface Allergy {
  id: string;
  substance: string;
  severity: string;
  reaction: string | null;
}

interface Medication {
  id: string;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  status: string;
}

interface Condition {
  id: string;
  name: string;
  icd10Code: string | null;
  status: string;
}

interface Vital {
  id: string;
  recordedAt: string;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  spo2: number | null;
  bmi: number | null;
}

const SEVERITY_TONE: Record<string, string> = {
  MILD: 'text-emerald-700',
  MODERATE: 'text-amber-700',
  SEVERE: 'text-rose-700',
};

export function PatientDetailScreen({
  patientId,
  onBack,
  onSelectConsult,
}: {
  patientId: string;
  onBack: () => void;
  onSelectConsult: (consultId: string) => void;
}) {
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async (): Promise<Patient> => {
      const { data, error } = await patientsControllerFindOne({ path: { id: patientId } });
      if (error || !data) throw new Error('Patient not found');
      return data as unknown as Patient;
    },
  });

  const allergies = useQuery({
    queryKey: ['clinical', patientId, 'allergies'],
    queryFn: async (): Promise<Allergy[]> => {
      const { data, error } = await clinicalControllerListAllergies({ path: { patientId } });
      if (error || !data) return [];
      return data as unknown as Allergy[];
    },
  });

  const meds = useQuery({
    queryKey: ['clinical', patientId, 'meds'],
    queryFn: async (): Promise<Medication[]> => {
      const { data, error } = await clinicalControllerListMeds({ path: { patientId } });
      if (error || !data) return [];
      return data as unknown as Medication[];
    },
  });

  const conditions = useQuery({
    queryKey: ['clinical', patientId, 'conditions'],
    queryFn: async (): Promise<Condition[]> => {
      const { data, error } = await clinicalControllerListConditions({ path: { patientId } });
      if (error || !data) return [];
      return data as unknown as Condition[];
    },
  });

  const vitals = useQuery({
    queryKey: ['clinical', patientId, 'vitals'],
    queryFn: async (): Promise<Vital[]> => {
      const { data, error } = await clinicalControllerListVitals({ path: { patientId } });
      if (error || !data) return [];
      return data as unknown as Vital[];
    },
  });

  if (patient.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (patient.error || !patient.data) {
    return (
      <View className="flex-1 bg-background px-6 py-8">
        <TouchableOpacity onPress={onBack}>
          <Text className="text-sm text-primary">‹ Back</Text>
        </TouchableOpacity>
        <Text className="mt-4 text-sm text-destructive">
          {(patient.error as Error)?.message ?? 'Patient not found'}
        </Text>
      </View>
    );
  }

  const p = patient.data;
  const latestVital = vitals.data?.[0];

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="border-b border-border bg-card px-6 pb-3 pt-4">
        <TouchableOpacity onPress={onBack}>
          <Text className="text-sm text-primary">‹ Patients</Text>
        </TouchableOpacity>
        <Text className="mt-2 text-2xl font-semibold text-foreground">
          {p.lastName}, {p.firstName}
        </Text>
        <Text className="text-xs text-muted-foreground">
          MRN <Text className="font-mono">{p.mrn}</Text> · {p.sex} ·{' '}
          {new Date(p.dateOfBirth).toLocaleDateString()}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {p.email ?? '—'}
          {p.phone ? `  ·  ${p.phone}` : ''}
        </Text>
      </View>

      <Section title="Latest vitals">
        {latestVital ? (
          <View className="flex-row flex-wrap gap-3">
            <Stat label="BP" value={
              latestVital.systolic && latestVital.diastolic
                ? `${latestVital.systolic}/${latestVital.diastolic}`
                : '—'
            } />
            <Stat label="HR" value={latestVital.heartRate ?? '—'} />
            <Stat label="SpO₂" value={latestVital.spo2 ?? '—'} />
            <Stat label="BMI" value={latestVital.bmi ?? '—'} />
          </View>
        ) : (
          <Empty text="No vitals recorded." />
        )}
      </Section>

      <Section title="Consultations">
        <ConsultList patientId={p.id} onSelect={onSelectConsult} />
      </Section>

      <Section title="Allergies">
        {allergies.data && allergies.data.length > 0 ? (
          allergies.data.map((a) => (
            <View key={a.id} className="py-1.5">
              <Text className="text-sm text-foreground">
                {a.substance}{' '}
                <Text className={`text-xs ${SEVERITY_TONE[a.severity] ?? ''}`}>
                  ({a.severity})
                </Text>
              </Text>
              {a.reaction && (
                <Text className="text-xs text-muted-foreground">→ {a.reaction}</Text>
              )}
            </View>
          ))
        ) : (
          <Empty text="No known allergies." />
        )}
      </Section>

      <Section title="Medications">
        {meds.data && meds.data.length > 0 ? (
          meds.data.map((m) => (
            <View key={m.id} className="py-1.5">
              <Text className="text-sm text-foreground">
                {m.drugName}{' '}
                <Text className="text-xs text-muted-foreground">({m.status})</Text>
              </Text>
              <Text className="text-xs text-muted-foreground">
                {[m.dose, m.frequency].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
          ))
        ) : (
          <Empty text="No active medications." />
        )}
      </Section>

      <Section title="Conditions">
        {conditions.data && conditions.data.length > 0 ? (
          conditions.data.map((c) => (
            <View key={c.id} className="py-1.5">
              <Text className="text-sm text-foreground">
                {c.name}{' '}
                {c.icd10Code && (
                  <Text className="text-xs font-mono text-muted-foreground">
                    {c.icd10Code}
                  </Text>
                )}{' '}
                <Text className="text-xs text-muted-foreground">({c.status})</Text>
              </Text>
            </View>
          ))
        ) : (
          <Empty text="No conditions on file." />
        )}
      </Section>

      <Section title="Prescriptions">
        <PrescriptionList patientId={p.id} />
      </Section>

      <Section title="Invoices">
        <InvoiceList patientId={p.id} />
      </Section>
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View className="rounded border border-border bg-background px-3 py-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-base font-semibold text-foreground">{value}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text className="text-xs text-muted-foreground">{text}</Text>;
}
