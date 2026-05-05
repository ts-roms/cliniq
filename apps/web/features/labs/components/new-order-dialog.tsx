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
  TEST_PRESETS,
  createOrderSchema,
  type CreateOrderInput,
  type CreateOrderOutput,
} from '../schemas/labs';
import { useCreateLabOrder } from '../hooks/use-labs';

export function NewLabOrderDialog({
  patientId,
  consultationId,
}: {
  patientId: string;
  consultationId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Order labs</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New lab order</DialogTitle>
          <DialogDescription>
            Pick from common panels or add custom tests. Reference ranges
            populate the abnormal-flag at result entry.
          </DialogDescription>
        </DialogHeader>
        <NewLabOrderForm
          patientId={patientId}
          consultationId={consultationId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewLabOrderForm({
  patientId,
  consultationId,
  onDone,
}: {
  patientId: string;
  consultationId?: string;
  onDone: () => void;
}) {
  const create = useCreateLabOrder({ patientId, consultationId });
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrderInput, unknown, CreateOrderOutput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      patientId,
      consultationId,
      items: [{ testName: '' }],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset();
    onDone();
  });

  const loadPreset = (category: string) => {
    const preset = TEST_PRESETS.find((p) => p.category === category);
    if (!preset) return;
    replace(
      preset.tests.map((t) => ({
        testCode: t.testCode ?? undefined,
        testName: t.testName,
        category: preset.category,
        resultUnit: t.resultUnit ?? undefined,
        referenceLow: t.referenceLow,
        referenceHigh: t.referenceHigh,
      })),
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Vendor / lab" error={errors.vendor?.message}>
          <Input placeholder="Hi-Precision" {...register('vendor')} />
        </FormField>
        <FormField label="Lab reference (optional)" error={errors.externalRef?.message}>
          <Input {...register('externalRef')} />
        </FormField>
      </div>
      <FormField label="Notes" error={errors.notes?.message}>
        <Input {...register('notes')} />
      </FormField>

      <div className="rounded border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Quick add
        </p>
        <div className="flex flex-wrap gap-1">
          {TEST_PRESETS.map((p) => (
            <Button
              key={p.category}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => loadPreset(p.category)}
            >
              {p.category}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {fields.map((field, idx) => (
          <div key={field.id} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-5">
              <FormField
                label={idx === 0 ? 'Test' : ''}
                error={errors.items?.[idx]?.testName?.message}
              >
                <Input placeholder="e.g. Hemoglobin" {...register(`items.${idx}.testName`)} />
              </FormField>
            </div>
            <div className="col-span-2">
              <FormField label={idx === 0 ? 'Unit' : ''}>
                <Input placeholder="g/dL" {...register(`items.${idx}.resultUnit`)} />
              </FormField>
            </div>
            <div className="col-span-2">
              <FormField label={idx === 0 ? 'Ref low' : ''}>
                <Input type="number" step="0.1" {...register(`items.${idx}.referenceLow`)} />
              </FormField>
            </div>
            <div className="col-span-2">
              <FormField label={idx === 0 ? 'Ref high' : ''}>
                <Input type="number" step="0.1" {...register(`items.${idx}.referenceHigh`)} />
              </FormField>
            </div>
            <div className="col-span-1 pb-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
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
          size="sm"
          variant="outline"
          onClick={() => append({ testName: '' })}
        >
          + Add test
        </Button>
        {errors.items?.message && (
          <p className="text-xs text-destructive">{errors.items.message}</p>
        )}
      </div>

      {create.error && (
        <p className="text-xs text-destructive">{(create.error as Error).message}</p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create order'}
        </Button>
      </DialogFooter>
    </form>
  );
}
