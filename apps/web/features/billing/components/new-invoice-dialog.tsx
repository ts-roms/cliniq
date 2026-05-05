'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  createInvoiceSchema,
  type CreateInvoiceInput,
  type CreateInvoiceOutput,
} from '../schemas/billing';
import { useCreateInvoice } from '../hooks/use-billing';
import { formatCentavos } from './money';

export function NewInvoiceDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New invoice</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Enter line items in centavos (e.g. ₱1,500.00 = 150000).
          </DialogDescription>
        </DialogHeader>
        <NewInvoiceForm patientId={patientId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewInvoiceForm({
  patientId,
  onDone,
}: {
  patientId: string;
  onDone: () => void;
}) {
  const create = useCreateInvoice(patientId);
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateInvoiceInput, unknown, CreateInvoiceOutput>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      patientId,
      items: [{ description: '', quantity: 1, unitPriceCentavos: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items') ?? [];
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPriceCentavos) || 0),
    0,
  );
  const discount = Number(watch('discountCentavos')) || 0;
  const tax = Number(watch('taxCentavos')) || 0;
  const total = Math.max(subtotal - discount + tax, 0);

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset();
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div key={field.id} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-6">
              <FormField
                label={idx === 0 ? 'Description' : ''}
                error={errors.items?.[idx]?.description?.message}
              >
                <Input
                  placeholder="Consultation"
                  {...register(`items.${idx}.description`)}
                />
              </FormField>
            </div>
            <div className="col-span-2">
              <FormField
                label={idx === 0 ? 'Qty' : ''}
                error={errors.items?.[idx]?.quantity?.message}
              >
                <Input type="number" {...register(`items.${idx}.quantity`)} />
              </FormField>
            </div>
            <div className="col-span-3">
              <FormField
                label={idx === 0 ? 'Unit (centavos)' : ''}
                error={errors.items?.[idx]?.unitPriceCentavos?.message}
              >
                <Input
                  type="number"
                  {...register(`items.${idx}.unitPriceCentavos`)}
                />
              </FormField>
            </div>
            <div className="col-span-1 pb-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(idx)}
                disabled={fields.length === 1}
                className="text-destructive hover:text-destructive"
              >
                ×
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({ description: '', quantity: 1, unitPriceCentavos: 0 })
          }
        >
          + Add line
        </Button>
        {errors.items?.message && (
          <p className="text-xs text-destructive">{errors.items.message}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormField label="Discount (centavos)" error={errors.discountCentavos?.message}>
          <Input type="number" {...register('discountCentavos')} />
        </FormField>
        <FormField label="Tax (centavos)" error={errors.taxCentavos?.message}>
          <Input type="number" {...register('taxCentavos')} />
        </FormField>
        <FormField label="Notes" error={errors.notes?.message}>
          <Input {...register('notes')} />
        </FormField>
      </div>

      <div className="flex items-center justify-between rounded border bg-muted/40 p-3 text-sm">
        <div className="space-y-0.5 text-muted-foreground">
          <div>Subtotal: {formatCentavos(subtotal)}</div>
          <div>Discount: −{formatCentavos(discount)}</div>
          <div>Tax: +{formatCentavos(tax)}</div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-semibold">{formatCentavos(total)}</p>
        </div>
      </div>

      {create.error && (
        <p className="text-xs text-destructive">{(create.error as Error).message}</p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || create.isPending}>
          {create.isPending ? 'Saving…' : 'Create invoice'}
        </Button>
      </DialogFooter>
    </form>
  );
}
