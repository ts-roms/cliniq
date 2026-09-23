'use client';

import { useMutation } from '@tanstack/react-query';
import { API_BASE } from '@/shared/lib/api-base';

/**
 * Fetches the patient-portal invoice PDF (`/api/me/invoices/:id/pdf` —
 * self-scoped, ownership-checked server-side) and opens it in a new tab.
 * Same hand-rolled fetch pattern as the staff `useInvoicePdf` since the
 * generated SDK doesn't model binary responses.
 */
export function usePortalInvoicePdf() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      // Auth rides on the httpOnly `cliniq.access` cookie.
      const res = await fetch(`${API_BASE}/api/me/invoices/${invoiceId}/pdf`, {
        credentials: 'include',
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
