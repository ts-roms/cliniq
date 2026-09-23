'use client';

import { useQuery } from '@tanstack/react-query';
import { patientsControllerModuleData } from '@org/api-client';
import {
  ALL_CLINIC_MODULES,
  isClinicModule,
  type ClinicModule,
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
  isLoading: boolean;
} {
  const settings = useTenantSettings();
  const raw = (settings.data as { modules?: unknown } | undefined)?.modules;
  const modules = Array.isArray(raw)
    ? raw.filter(isClinicModule)
    : [...ALL_CLINIC_MODULES];
  return { modules, isLoading: settings.isLoading };
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
      if (error || !data) return {};
      return data as Partial<Record<ClinicModule, boolean>>;
    },
  });
}
