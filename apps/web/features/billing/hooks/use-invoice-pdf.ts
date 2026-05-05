'use client';

import { useMutation } from '@tanstack/react-query';
import { loadSession } from '@/features/auth/session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Fetches the invoice PDF as a Blob and opens it in a new tab. Hand-rolled
 * because the generated SDK doesn't model binary responses, and `<a href>`
 * can't carry the auth header.
 */
export function useInvoicePdf() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const token = loadSession()?.accessToken;
      if (!token) throw new Error('not signed in');
      const res = await fetch(`${API_BASE}/api/invoices/${invoiceId}/pdf`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch PDF (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank');
      // Fallback: if popups are blocked, force a download.
      if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      // Browsers keep the blob alive while the new tab loads it; revoke after a delay.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { invoiceId };
    },
  });
}
