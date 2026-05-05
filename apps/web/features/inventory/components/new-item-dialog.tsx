'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
  createItemSchema,
  type CreateItemInput,
  type CreateItemOutput,
} from '../schemas/inventory';
import { useCreateItem } from '../hooks/use-inventory';

export function NewItemDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateItem();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateItemInput, unknown, CreateItemOutput>({
    resolver: zodResolver(createItemSchema),
    defaultValues: { unit: 'each', reorderLevel: 0, defaultPriceCentavos: 0, isControlled: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add inventory item</DialogTitle>
          <DialogDescription>
            Catalog only — receive stock from the item detail page once created.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="SKU" error={errors.sku?.message}>
              <Input placeholder="AMOX-500" {...register('sku')} />
            </FormField>
            <FormField label="Unit" error={errors.unit?.message}>
              <Input placeholder="tablet" {...register('unit')} />
            </FormField>
          </div>
          <FormField label="Name" error={errors.name?.message}>
            <Input placeholder="Amoxicillin 500mg cap" {...register('name')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category" error={errors.category?.message}>
              <Input placeholder="antibiotic" {...register('category')} />
            </FormField>
            <FormField label="Reorder level" error={errors.reorderLevel?.message}>
              <Input type="number" {...register('reorderLevel')} />
            </FormField>
          </div>
          <FormField label="Default price (centavos)" error={errors.defaultPriceCentavos?.message}>
            <Input type="number" {...register('defaultPriceCentavos')} />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isControlled')} />
            <span>Controlled substance (extra logging on dispense)</span>
          </label>
          {create.error && (
            <p className="text-xs text-destructive">{(create.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
