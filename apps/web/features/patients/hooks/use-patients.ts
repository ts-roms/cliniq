'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  patientsControllerCreate,
  patientsControllerExportRecord,
  patientsControllerFindOne,
  patientsControllerList,
  patientsControllerRemove,
  patientsControllerUpdate,
} from '@org/api-client';
import type {
  Patient,
  PatientListResult,
  CreatePatientInput,
  UpdatePatientInput,
} from '../schemas/patient';

export const patientKeys = {
  all: ['patients'] as const,
  list: (q?: string) => ['patients', 'list', q ?? ''] as const,
  detail: (id: string) => ['patients', 'detail', id] as const,
};

export function usePatientList(q: string) {
  return useQuery({
    queryKey: patientKeys.list(q),
    queryFn: async (): Promise<PatientListResult> => {
      const { data, error } = await patientsControllerList({
        query: { q: q || undefined, limit: 25 },
      });
      if (error || !data) throw new Error('Failed to load patients');
      return data as unknown as PatientListResult;
    },
    placeholderData: (prev) => prev,
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn: async (): Promise<Patient> => {
      const { data, error } = await patientsControllerFindOne({ path: { id } });
      if (error || !data) throw new Error('Patient not found');
      return data as unknown as Patient;
    },
  });
}

function normalizeBody(input: CreatePatientInput | UpdatePatientInput) {
  return {
    ...input,
    email: input.email || undefined,
    phone: input.phone || undefined,
    dateOfBirth: input.dateOfBirth
      ? (new Date(input.dateOfBirth).toISOString() as unknown as Date)
      : undefined,
  };
}

export function useCreatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePatientInput) => {
      const { data, error } = await patientsControllerCreate({
        body: normalizeBody(input) as Parameters<typeof patientsControllerCreate>[0]['body'],
      });
      if (error || !data) throw new Error('Create failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePatientInput) => {
      const { data, error } = await patientsControllerUpdate({
        path: { id },
        body: normalizeBody(input) as Parameters<typeof patientsControllerUpdate>[0]['body'],
      });
      if (error || !data) throw new Error('Update failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}

export function useExportPatient() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await patientsControllerExportRecord({ path: { id } });
      if (error || !data) throw new Error('Export failed');
      return data as unknown as { patient: { mrn: string } };
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await patientsControllerRemove({ path: { id } });
      if (error) throw new Error('Delete failed');
      return { id };
    },
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.all });
      queryClient.removeQueries({ queryKey: patientKeys.detail(id) });
    },
  });
}
