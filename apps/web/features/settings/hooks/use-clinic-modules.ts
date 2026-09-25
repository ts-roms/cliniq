'use client';

import { useQuery } from '@tanstack/react-query';
import { patientsControllerModuleData } from '@org/api-client';
import {
  ALL_CLINIC_MODULES,
  isClinicModule,
  type ClinicModule,
  type ClinicType,
} from '@org/shared-types';
import { useTenantSettings } from './use-settings';

/**
 * The modules this clinic practises, already resolved by the api
 * (clinic-type default -> explicit configuration -> narrowed by plan).
 *
 * While settings are loading this returns every module rather than none:
 * flashing a chart with its specialty cards missing and then adding them is
 * worse than the reverse, and it keeps the pre-existing behaviour on any
 * error path.
 */
export function useEnabledModules(): {
  modules: ClinicModule[];
  clinicType: ClinicType | null;
  isLoading: boolean;
} {
  const settings = useTenantSettings();
  const data = settings.data as
    | { modules?: unknown; type?: string | null }
    | undefined;
  const raw = data?.modules;
  const modules = Array.isArray(raw)
    ? raw.filter(isClinicModule)
    : [...ALL_CLINIC_MODULES];
  const clinicType = (data?.type ?? null) as ClinicType | null;
  return { modules, clinicType, isLoading: settings.isLoading };
}

export const patientModuleKeys = {
  data: (patientId: string) => ['patients', patientId, 'modules'] as const,
};

/**
 * Which modules hold records for this patient, regardless of configuration.
 *
 * Drives the "switched off but this patient has data" case: the chart keeps
 * rendering those, flagged, because hiding clinical history a patient
 * actually has is the failure mode that hurts someone.
 */
export function usePatientModuleData(patientId: string) {
  return useQuery({
    queryKey: patientModuleKeys.data(patientId),
    enabled: !!patientId,
    queryFn: async (): Promise<Partial<Record<ClinicModule, boolean>>> => {
      const { data, error } = await patientsControllerModuleData({
        path: { id: patientId },
      });
      // Thrown, not swallowed into `{}`: an empty answer reads as "no
      // records anywhere" and would fold real history into the Add-a-service
      // bar. The chart treats an error as "unknown" and opens everything.
      if (error || !data) throw new Error('Failed to load patient modules');
      return data as Partial<Record<ClinicModule, boolean>>;
    },
  });
}
