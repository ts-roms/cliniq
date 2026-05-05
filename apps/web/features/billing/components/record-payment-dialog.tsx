'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  recordPaymentSchema,
  type Invoice,
  type RecordPaymentInput,
  type RecordPaymentOutput,
} from '../schemas/billing';
import { useRecordPayment } from '../hooks/use-billing';
import { formatCentavos } from './money';

export function RecordPaymentDialog({
  patientId,
  invoice,
}: {
  patientId: string;
  invoice: Invoice;
}) {
  const [open, setOpen] = useState(false);
  const remaining = Math.max(invoice.totalCentavos - invoice.paidCentavos, 0);
  const record = useRecordPayment(patientId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentInput, unknown, RecordPaymentOutput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      method: 'CASH',
      amountCentavos: remaining,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await record.mutateAsync({ invoiceId: invoice.id, input: values });
    reset();
    setOpen(false);
  });

  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment for {invoice.number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Outstanding balance: <strong>{formatCentavos(remaining)}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Amount (centavos)" error={errors.amountCentavos?.message}>
              <Input type="number" {...register('amountCentavos')} />
            </FormField>
            <FormField label="Method" error={errors.method?.message}>
              <Select {...register('method')}>
                <option value="CASH">Cash</option>
                <option value="GCASH">GCash</option>
                <option value="MAYA">Maya</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
                <option value="HMO">HMO</option>
                <option value="INSURANCE">Insurance</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Reference / OR #" error={errors.reference?.message}>
            <Input placeholder="OR-2026-0001" {...register('reference')} />
          </FormField>
          {record.error && (
            <p className="text-xs text-destructive">{(record.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || record.isPending}>
              {record.isPending ? 'Saving…' : 'Save payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
