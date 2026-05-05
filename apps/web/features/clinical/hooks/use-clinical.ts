'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clinicalControllerAddAllergy,
  clinicalControllerAddCondition,
  clinicalControllerAddMed,
  clinicalControllerAddVital,
  clinicalControllerListAllergies,
  clinicalControllerListConditions,
  clinicalControllerListMeds,
  clinicalControllerListVitals,
  clinicalControllerRemoveAllergy,
} from '@org/api-client';
import type {
  Allergy,
  Condition,
  CreateAllergyInput,
  CreateConditionOutput,
  CreateMedicationOutput,
  CreateVitalOutput,
  Medication,
  Vital,
} from '../schemas/clinical';

export const clinicalKeys = {
  all: (patientId: string) => ['clinical', patientId] as const,
  allergies: (patientId: string) => ['clinical', patientId, 'allergies'] as const,
  meds: (patientId: string) => ['clinical', patientId, 'meds'] as const,
  conditions: (patientId: string) => ['clinical', patientId, 'conditions'] as const,
  vitals: (patientId: string) => ['clinical', patientId, 'vitals'] as const,
};

export function useAllergies(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.allergies(patientId),
    queryFn: async (): Promise<Allergy[]> => {
      const { data, error } = await clinicalControllerListAllergies({
        path: { patientId },
      });
      if (error || !data) throw new Error('Failed to load allergies');
      return data as unknown as Allergy[];
    },
  });
}

export function useAddAllergy(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAllergyInput) => {
      const { data, error } = await clinicalControllerAddAllergy({
        path: { patientId },
        body: input as Parameters<typeof clinicalControllerAddAllergy>[0]['body'],
      });
      if (error || !data) throw new Error('Add failed');
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: clinicalKeys.allergies(patientId) }),
  });
}

export function useRemoveAllergy(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await clinicalControllerRemoveAllergy({
        path: { patientId, id },
      });
      if (error) throw new Error('Remove failed');
      return { id };
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: clinicalKeys.allergies(patientId) }),
  });
}

export function useMedications(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.meds(patientId),
    queryFn: async (): Promise<Medication[]> => {
      const { data, error } = await clinicalControllerListMeds({
        path: { patientId },
      });
      if (error || !data) throw new Error('Failed to load medications');
      return data as unknown as Medication[];
    },
  });
}

export function useAddMedication(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMedicationOutput) => {
      const { data, error } = await clinicalControllerAddMed({
        path: { patientId },
        body: input as Parameters<typeof clinicalControllerAddMed>[0]['body'],
      });
      if (error || !data) throw new Error('Add failed');
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: clinicalKeys.meds(patientId) }),
  });
}

export function useConditions(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.conditions(patientId),
    queryFn: async (): Promise<Condition[]> => {
      const { data, error } = await clinicalControllerListConditions({
        path: { patientId },
      });
      if (error || !data) throw new Error('Failed to load conditions');
      return data as unknown as Condition[];
    },
  });
}

export function useAddCondition(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateConditionOutput) => {
      const { data, error } = await clinicalControllerAddCondition({
        path: { patientId },
        body: input as Parameters<typeof clinicalControllerAddCondition>[0]['body'],
      });
      if (error || !data) throw new Error('Add failed');
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: clinicalKeys.conditions(patientId) }),
  });
}

export function useVitals(patientId: string) {
  return useQuery({
    queryKey: clinicalKeys.vitals(patientId),
    queryFn: async (): Promise<Vital[]> => {
      const { data, error } = await clinicalControllerListVitals({
        path: { patientId },
      });
      if (error || !data) throw new Error('Failed to load vitals');
      return data as unknown as Vital[];
    },
  });
}

export function useAddVital(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateVitalOutput) => {
      const { data, error } = await clinicalControllerAddVital({
        path: { patientId },
        body: input as Parameters<typeof clinicalControllerAddVital>[0]['body'],
      });
      if (error || !data) throw new Error('Add failed');
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: clinicalKeys.vitals(patientId) }),
  });
}
