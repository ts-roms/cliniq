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
  dispenseSchema,
  type DispenseInput,
  type DispenseOutput,
} from '../schemas/inventory';
import { useDispense } from '../hooks/use-inventory';

export function DispenseDialog({ itemId, onHand }: { itemId: string; onHand: number }) {
  const [open, setOpen] = useState(false);
  const dispense = useDispense(itemId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DispenseInput, unknown, DispenseOutput>({
    resolver: zodResolver(dispenseSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    await dispense.mutateAsync(values);
    reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={onHand <= 0}>
          Dispense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispense from stock</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          On hand: <strong>{onHand}</strong>. Drawn FEFO across batches.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Quantity" error={errors.quantity?.message}>
            <Input type="number" max={onHand} {...register('quantity')} />
          </FormField>
          <FormField label="Prescription ID (optional)" error={errors.prescriptionId?.message}>
            <Input {...register('prescriptionId')} />
          </FormField>
          <FormField label="Reason" error={errors.reason?.message}>
            <Input placeholder="walk-in dispense" {...register('reason')} />
          </FormField>
          {dispense.error && (
            <p className="text-xs text-destructive">{(dispense.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || dispense.isPending}>
              {dispense.isPending ? 'Dispensing…' : 'Dispense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
