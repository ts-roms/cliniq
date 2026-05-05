'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  recordResultSchema,
  type LabOrder,
  type LabOrderItem,
  type RecordResultInput,
} from '../schemas/labs';
import { useRecordResult } from '../hooks/use-labs';

export function RecordResultsDialog({ order, patientId }: { order: LabOrder; patientId: string }) {
  const [open, setOpen] = useState(false);
  if (order.status === 'CANCELLED' || order.status === 'REPORTED') {
    return order.status === 'REPORTED' ? (
      <span className="text-xs text-emerald-700">reported</span>
    ) : null;
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Enter results
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Results · {order.number}</DialogTitle>
        </DialogHeader>
        <ul className="divide-y">
          {order.items.map((item) => (
            <li key={item.id} className="py-3">
              <ResultRow patientId={patientId} orderId={order.id} item={item} />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({
  patientId,
  orderId,
  item,
}: {
  patientId: string;
  orderId: string;
  item: LabOrderItem;
}) {
  const record = useRecordResult({ patientId });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecordResultInput>({
    resolver: zodResolver(recordResultSchema),
    defaultValues: {
      resultValue: item.resultValue ?? '',
      resultUnit: item.resultUnit ?? '',
      comment: item.comment ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await record.mutateAsync({ orderId, itemId: item.id, input: values });
  });

  const range =
    item.referenceLow !== null && item.referenceHigh !== null
      ? `${item.referenceLow}–${item.referenceHigh}`
      : item.referenceLow !== null
        ? `≥ ${item.referenceLow}`
        : item.referenceHigh !== null
          ? `≤ ${item.referenceHigh}`
          : null;

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-12 items-end gap-2">
      <div className="col-span-3">
        <p className="text-sm font-medium">{item.testName}</p>
        {range && (
          <p className="text-xs text-muted-foreground">
            ref {range} {item.resultUnit ?? ''}
          </p>
        )}
      </div>
      <div className="col-span-3">
        <FormField label="Value" error={errors.resultValue?.message}>
          <Input {...register('resultValue')} />
        </FormField>
      </div>
      <div className="col-span-2">
        <FormField label="Unit">
          <Input {...register('resultUnit')} />
        </FormField>
      </div>
      <div className="col-span-3">
        <FormField label="Comment">
          <Input {...register('comment')} />
        </FormField>
      </div>
      <div className="col-span-1 pb-1.5">
        <Button type="submit" size="sm" disabled={isSubmitting || record.isPending}>
          {record.isPending ? '…' : 'Save'}
        </Button>
      </div>
      {item.abnormalFlag && item.abnormalFlag !== 'NORMAL' && (
        <p className="col-span-12 text-xs">
          previous flag:{' '}
          <span className="font-mono text-rose-700">{item.abnormalFlag}</span>
        </p>
      )}
    </form>
  );
}
