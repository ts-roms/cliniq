'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
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
  PatientServicesBar,
  useEnabledModules,
  usePatientModuleData,
} from '@/features/settings';
import {
  Actions,
  ClinicModules,
  isClinicModule,
  resolvePatientModules,
  type ClinicModule,
} from '@org/shared-types';

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

  const patient = usePatient(id);

  // What this clinic practises, what this patient has on file, and who the
  // patient is decide which specialty cards open. Anything with records always
  // renders (flagged if the clinic has since switched it off); empty modules
  // open only when they are the clinic's specialty or the clinician opens
  // them from the Add-a-service bar. See resolvePatientModules.
  const {
    modules,
    clinicType,
    isLoading: modulesLoading,
  } = useEnabledModules();
  const moduleData = usePatientModuleData(id);
  const [opened, setOpened] = useState<ClinicModule[]>([]);
  const [scrollTo, setScrollTo] = useState<ClinicModule | null>(null);

  const decisions = useMemo(() => {
    if (!patient.data) return null;
    return resolvePatientModules({
      enabled: modules,
      // If we cannot tell what is on file, open everything the clinic offers
      // rather than risk folding real history away.
      hasData: moduleData.isError
        ? Object.fromEntries(modules.map((m) => [m, true]))
        : (moduleData.data ?? {}),
      patient: patient.data,
      clinicType,
      opened,
    });
  }, [
    patient.data,
    modules,
    clinicType,
    moduleData.data,
    moduleData.isError,
    opened,
  ]);

  const open = useCallback((m: ClinicModule) => {
    setOpened((prev) => (prev.includes(m) ? prev : [...prev, m]));
    setScrollTo(m);
  }, []);

  // The consult's Visit focus panel links to /patients/:id#module-<m>. The
  // target may be folded into the Add-a-service bar, so open it first.
  useEffect(() => {
    const fromHash = () => {
      const m = window.location.hash.replace(/^#module-/, '');
      if (isClinicModule(m)) open(m);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [open]);

  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(`module-${scrollTo}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollTo(null);
  }, [scrollTo, decisions]);

  const section = (m: ClinicModule, card: React.ReactNode) => {
    const d = decisions?.find((x) => x.module === m);
    if (!d || (d.placement !== 'shown' && d.placement !== 'out_of_scope')) {
      return null;
    }
    return (
      <ModuleSection
        module={m}
        enabled={d.placement === 'shown'}
        hasData={d.placement === 'out_of_scope'}
      >
        {card}
      </ModuleSection>
    );
  };
  const servicesLoading = modulesLoading || moduleData.isLoading;

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
        {!servicesLoading &&
          section(
            ClinicModules.HMO,
            <HmoCardsCard patientId={patient.data.id} />,
          )}
      </div>
      {servicesLoading ? (
        <p
          className="text-sm text-muted-foreground"
          data-test="patient-services-loading"
        >
          Loading services…
        </p>
      ) : (
        decisions && (
          <PatientServicesBar
            decisions={decisions}
            enabled={modules}
            onOpen={open}
          />
        )
      )}
      <div className="space-y-6">
        <PrescriptionsCard patientId={patient.data.id} />
        {!servicesLoading && (
          <>
            {section(
              ClinicModules.LAB_ORDERS,
              <LabOrdersCard patientId={patient.data.id} />,
            )}
            {section(
              ClinicModules.DENTAL,
              <DentalChartCard patientId={patient.data.id} />,
            )}
            {section(ClinicModules.OB, <ObCard patientId={patient.data.id} />)}
            {section(
              ClinicModules.ULTRASOUND,
              <UltrasoundCard patientId={patient.data.id} />,
            )}
          </>
        )}
        {canReadBilling && <InvoicesCard patientId={patient.data.id} />}
      </div>
    </div>
  );
}
