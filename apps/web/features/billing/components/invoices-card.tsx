'use client';

import {
  Card, CardContent, CardHeader, CardTitle,
  Loading,
  ErrorMessage,
  EmptyState,
} from '@org/ui';
import { useInvoicesForPatient } from '../hooks/use-billing';
import { InvoiceRow } from './invoice-row';
import { NewInvoiceDialog } from './new-invoice-dialog';

export function InvoicesCard({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = useInvoicesForPatient(patientId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Invoices</CardTitle>
        <NewInvoiceDialog patientId={patientId} />
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {error && <ErrorMessage error={error} />}
        {data && data.length === 0 && (
          <EmptyState
            title="No invoices yet"
            description="Bill the patient with the New invoice button above."
          />
        )}
        {data && data.length > 0 && (
          <div className="overflow-x-auto rounded border">
            <table className="w-full min-w-[760px]">
              <thead className="bg-muted/40">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Number</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((inv) => (
                  <InvoiceRow key={inv.id} patientId={patientId} invoice={inv} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
