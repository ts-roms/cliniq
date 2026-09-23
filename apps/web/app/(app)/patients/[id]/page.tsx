'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  PatientContactCard,
  PatientHeader,
  usePatient,
} from '@/features/patients';
import {
  ConsultationsCard,
  useConsultationsForPatient,
  useStartConsultation,
} from '@/features/consultations';
import { PrescriptionsCard } from '@/features/prescriptions';
import { ConsentsCard } from '@/features/consents';
import {
  AllergiesCard,
  ConditionsCard,
  MedicationsCard,
  VitalsCard,
} from '@/features/clinical';
import { InvoicesCard } from '@/features/billing';
import { HmoCardsCard } from '@/features/hmo';
import { LabOrdersCard } from '@/features/labs';
import { DentalChartCard } from '@/features/dental';
import { ObCard, UltrasoundCard } from '@/features/ob';
import { useCan } from '@/features/auth';
import {
  ModuleSection,
  useEnabledModules,
  usePatientModuleData,
} from '@/features/settings';
import { Actions, ClinicModules } from '@org/shared-types';

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const can = useCan();
  // Sections the api would 403 for this role are not rendered at all
  // (e.g. a RECEPTIONIST has no consult:read, a NURSE no billing:read),
  // instead of showing a card that fails to load.
  const canReadConsults = can(Actions.CONSULT_READ);
  const canReadBilling = can(Actions.BILLING_READ);

  // What this clinic practises, and what this patient actually has on file.
  // A module that is off still renders when the patient has records in it.
  const { modules } = useEnabledModules();
  const moduleData = usePatientModuleData(id);
  const shows = (m: (typeof ClinicModules)[keyof typeof ClinicModules]) => ({
    enabled: modules.includes(m),
    hasData: moduleData.data?.[m] === true,
  });

  const patient = usePatient(id);
  const consults = useConsultationsForPatient(id, {
    enabled: canReadConsults,
  });
  const startConsult = useStartConsultation(id);

  if (patient.isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (patient.error || !patient.data) {
    return (
      <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-destructive">
          {(patient.error as Error)?.message ?? 'Patient not found'}
        </p>
        <Link
          href="/patients"
          className="mt-3 inline-block text-sm text-primary underline"
        >
          ← Back to patients
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PatientHeader
        patient={patient.data}
        onStartConsult={
          can(Actions.CONSULT_WRITE) ? () => startConsult.mutate() : undefined
        }
        isStarting={startConsult.isPending}
      />
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
        <PatientContactCard patient={patient.data} />
        {canReadConsults && (
          <ConsultationsCard
            items={consults.data}
            isLoading={consults.isLoading}
          />
        )}
        <ConsentsCard patientId={patient.data.id} />
        <VitalsCard patientId={patient.data.id} />
        <AllergiesCard patientId={patient.data.id} />
        <MedicationsCard patientId={patient.data.id} />
        <ConditionsCard patientId={patient.data.id} />
        <ModuleSection module={ClinicModules.HMO} {...shows(ClinicModules.HMO)}>
          <HmoCardsCard patientId={patient.data.id} />
        </ModuleSection>
      </div>
      <div className="space-y-6">
        <PrescriptionsCard patientId={patient.data.id} />
        <ModuleSection
          module={ClinicModules.LAB_ORDERS}
          {...shows(ClinicModules.LAB_ORDERS)}
        >
          <LabOrdersCard patientId={patient.data.id} />
        </ModuleSection>
        <ModuleSection
          module={ClinicModules.DENTAL}
          {...shows(ClinicModules.DENTAL)}
        >
          <DentalChartCard patientId={patient.data.id} />
        </ModuleSection>
        <ModuleSection module={ClinicModules.OB} {...shows(ClinicModules.OB)}>
          <ObCard patientId={patient.data.id} />
        </ModuleSection>
        <ModuleSection
          module={ClinicModules.ULTRASOUND}
          {...shows(ClinicModules.ULTRASOUND)}
        >
          <UltrasoundCard patientId={patient.data.id} />
        </ModuleSection>
        {canReadBilling && <InvoicesCard patientId={patient.data.id} />}
      </div>
    </div>
  );
}
