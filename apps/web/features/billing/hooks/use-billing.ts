'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  billingControllerCreateInvoice,
  billingControllerListInvoices,
  billingControllerRecordPayment,
} from '@org/api-client';
import type {
  CreateInvoiceOutput,
  Invoice,
  RecordPaymentOutput,
} from '../schemas/billing';

export const billingKeys = {
  all: ['billing'] as const,
  invoices: (patientId: string) => ['billing', 'invoices', patientId] as const,
};

export function useInvoicesForPatient(patientId: string) {
  return useQuery({
    queryKey: billingKeys.invoices(patientId),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await billingControllerListInvoices({
        query: { patientId },
      });
      if (error || !data) throw new Error('Failed to load invoices');
      return data as unknown as Invoice[];
    },
    enabled: !!patientId,
  });
}

export function useCreateInvoice(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceOutput) => {
      const { data, error } = await billingControllerCreateInvoice({
        body: input as Parameters<typeof billingControllerCreateInvoice>[0]['body'],
      });
      if (error || !data) throw new Error('Create failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.invoices(patientId) }),
  });
}

export function useRecordPayment(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      input,
    }: {
      invoiceId: string;
      input: RecordPaymentOutput;
    }) => {
      const { data, error } = await billingControllerRecordPayment({
        path: { id: invoiceId },
        body: input as Parameters<typeof billingControllerRecordPayment>[0]['body'],
      });
      if (error || !data) throw new Error('Payment failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.invoices(patientId) }),
  });
}
