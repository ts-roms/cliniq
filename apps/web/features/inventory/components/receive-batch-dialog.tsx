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
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  receiveBatchSchema,
  type ReceiveBatchInput,
  type ReceiveBatchOutput,
} from '../schemas/inventory';
import { useReceiveBatch } from '../hooks/use-inventory';

export function ReceiveBatchDialog({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const receive = useReceiveBatch(itemId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReceiveBatchInput, unknown, ReceiveBatchOutput>({
    resolver: zodResolver(receiveBatchSchema),
    defaultValues: { unitCostCentavos: 0 },
  });

  const onSubmit = handleSubmit(async (values) => {
    await receive.mutateAsync(values);
    reset({ unitCostCentavos: 0 });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Receive stock</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive batch</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Quantity" error={errors.receivedQty?.message}>
              <Input type="number" {...register('receivedQty')} />
            </FormField>
            <FormField label="Unit cost (centavos)" error={errors.unitCostCentavos?.message}>
              <Input type="number" {...register('unitCostCentavos')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Lot number" error={errors.lotNumber?.message}>
              <Input placeholder="LOT-2026-001" {...register('lotNumber')} />
            </FormField>
            <FormField label="Expires on" error={errors.expiresOn?.message}>
              <Input type="date" {...register('expiresOn')} />
            </FormField>
          </div>
          <FormField label="Supplier" error={errors.supplierName?.message}>
            <Input placeholder="Mercury Drug" {...register('supplierName')} />
          </FormField>
          {receive.error && (
            <p className="text-xs text-destructive">{(receive.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || receive.isPending}>
              {receive.isPending ? 'Saving…' : 'Save batch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
