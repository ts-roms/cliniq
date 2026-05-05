'use client';

import { useMutation } from '@tanstack/react-query';
import { loadSession } from '@/features/auth/session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Fetches the patient-portal invoice PDF (`/api/me/invoices/:id/pdf` —
 * self-scoped, ownership-checked server-side) and opens it in a new tab.
 * Same hand-rolled fetch pattern as the staff `useInvoicePdf` since the
 * generated SDK doesn't model binary responses.
 */
export function usePortalInvoicePdf() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const token = loadSession()?.accessToken;
      if (!token) throw new Error('not signed in');
      const res = await fetch(`${API_BASE}/api/me/invoices/${invoiceId}/pdf`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch invoice (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank');
      if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { invoiceId };
    },
  });
}
