'use client';

import { memo } from 'react';
import { Button } from '@org/ui';
import { FileClaimDialog } from '@/features/hmo';
import type { Invoice, InvoiceStatus } from '../schemas/billing';
import { formatCentavos } from './money';
import { RecordPaymentDialog } from './record-payment-dialog';
import { useInvoicePdf } from '../hooks/use-invoice-pdf';

const STATUS_TONE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-zinc-200 text-zinc-700',
  SENT: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  OVERDUE: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-zinc-300 text-zinc-700 line-through',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export const InvoiceRow = memo(function InvoiceRow({
  patientId,
  invoice,
}: {
  patientId: string;
  invoice: Invoice;
}) {
  const remaining = Math.max(invoice.totalCentavos - invoice.paidCentavos, 0);
  const pdf = useInvoicePdf();
  return (
    <tr className="border-b last:border-0 align-top">
      <td className="px-4 py-3 font-mono text-sm">{invoice.number}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {formatDate(invoice.createdAt)}
      </td>
      <td className="px-4 py-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[invoice.status]}`}
        >
          {invoice.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {formatCentavos(invoice.totalCentavos, invoice.currency)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {formatCentavos(invoice.paidCentavos, invoice.currency)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm">
        {formatCentavos(remaining, invoice.currency)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => pdf.mutate(invoice.id)}
            disabled={pdf.isPending}
          >
            {pdf.isPending ? '…' : 'PDF'}
          </Button>
          <FileClaimDialog invoice={invoice} />
          <RecordPaymentDialog patientId={patientId} invoice={invoice} />
        </div>
      </td>
    </tr>
  );
});
