'use client';

import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { Button, Input } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import type { CreatePrescriptionFormInput } from '../schemas/prescription';

interface Props {
  index: number;
  register: UseFormRegister<CreatePrescriptionFormInput>;
  errors: FieldErrors<CreatePrescriptionFormInput>;
  canRemove: boolean;
  onRemove: () => void;
}

export function PrescriptionItemRow({
  index,
  register,
  errors,
  canRemove,
  onRemove,
}: Props) {
  const itemErr = errors.items?.[index];
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Item {index + 1}
        </span>
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Drug name" error={itemErr?.drugName?.message}>
          <Input placeholder="amoxicillin" {...register(`items.${index}.drugName`)} />
        </FormField>
        <FormField label="Strength">
          <Input placeholder="500mg" {...register(`items.${index}.strength`)} />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <FormField label="Form">
          <Input placeholder="tab" {...register(`items.${index}.form`)} />
        </FormField>
        <FormField label="Dose" error={itemErr?.dose?.message}>
          <Input placeholder="1 tab" {...register(`items.${index}.dose`)} />
        </FormField>
        <FormField label="Frequency" error={itemErr?.frequency?.message}>
          <Input placeholder="BID" {...register(`items.${index}.frequency`)} />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <FormField label="Days" error={itemErr?.durationDays?.message}>
          <Input
            type="number"
            placeholder="7"
            {...register(`items.${index}.durationDays`)}
          />
        </FormField>
        <FormField label="Quantity">
          <Input placeholder="14 tabs" {...register(`items.${index}.quantity`)} />
        </FormField>
        <FormField label="Refills" error={itemErr?.refills?.message}>
          <Input
            type="number"
            placeholder="0"
            {...register(`items.${index}.refills`)}
          />
        </FormField>
      </div>
      <FormField label="Instructions">
        <Input placeholder="after meals" {...register(`items.${index}.instructions`)} />
      </FormField>
    </div>
  );
}
