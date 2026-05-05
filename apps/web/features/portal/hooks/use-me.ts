'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  authControllerLogin,
  authControllerRegisterPatient,
  meControllerAppointments,
  meControllerInvoices,
  meControllerProfile,
  meControllerRecords,
} from '@org/api-client';
import { saveSession, type Session } from '@/features/auth/session';
import type {
  MeAppointment,
  MeInvoice,
  MeProfile,
  MeRecords,
  PatientLoginInput,
  PatientSignupInput,
} from '../schemas/portal';

export const meKeys = {
  profile: ['me', 'profile'] as const,
  appointments: ['me', 'appointments'] as const,
  invoices: ['me', 'invoices'] as const,
  records: ['me', 'records'] as const,
};

export function useMeProfile(enabled = true) {
  return useQuery({
    queryKey: meKeys.profile,
    enabled,
    queryFn: async (): Promise<MeProfile> => {
      const { data, error } = await meControllerProfile();
      if (error || !data) throw new Error('Failed to load profile');
      return data as unknown as MeProfile;
    },
  });
}

export function useMeAppointments(enabled = true) {
  return useQuery({
    queryKey: meKeys.appointments,
    enabled,
    queryFn: async (): Promise<MeAppointment[]> => {
      const { data, error } = await meControllerAppointments();
      if (error || !data) throw new Error('Failed to load appointments');
      return data as unknown as MeAppointment[];
    },
  });
}

export function useMeInvoices(enabled = true) {
  return useQuery({
    queryKey: meKeys.invoices,
    enabled,
    queryFn: async (): Promise<MeInvoice[]> => {
      const { data, error } = await meControllerInvoices();
      if (error || !data) throw new Error('Failed to load invoices');
      return data as unknown as MeInvoice[];
    },
  });
}

export function useMeRecords(enabled = true) {
  return useQuery({
    queryKey: meKeys.records,
    enabled,
    queryFn: async (): Promise<MeRecords> => {
      const { data, error } = await meControllerRecords();
      if (error || !data) throw new Error('Failed to load records');
      return data as unknown as MeRecords;
    },
  });
}

export function usePortalLogin() {
  return useMutation({
    mutationFn: async (input: PatientLoginInput): Promise<Session> => {
      const { data, error } = await authControllerLogin({ body: input });
      if (error || !data) throw new Error('Login failed');
      const session = data as unknown as Session;
      if (session.user.role !== 'PATIENT' || !session.user.patientId) {
        throw new Error('This account is not a patient portal account');
      }
      saveSession(session);
      return session;
    },
  });
}

export function usePortalSignup() {
  return useMutation({
    mutationFn: async (input: PatientSignupInput): Promise<Session> => {
      const { data, error } = await authControllerRegisterPatient({ body: input });
      if (error || !data) throw new Error('Signup failed');
      const session = data as unknown as Session;
      saveSession(session);
      return session;
    },
  });
}
