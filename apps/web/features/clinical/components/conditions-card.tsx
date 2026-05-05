'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
  Loading,
  EmptyState,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  createConditionSchema,
  type CreateConditionInput,
  type CreateConditionOutput,
} from '../schemas/clinical';
import { useAddCondition, useConditions } from '../hooks/use-clinical';

const STATUS_TONE = {
  ACTIVE: 'bg-amber-100 text-amber-800',
  CHRONIC: 'bg-purple-100 text-purple-800',
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  INACTIVE: 'bg-zinc-200 text-zinc-700',
} as const;

export function ConditionsCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useConditions(patientId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Conditions</CardTitle>
        <AddConditionDialog patientId={patientId} />
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {data && data.length === 0 && (
          <EmptyState
            title="No recorded conditions"
            description="Add ongoing diagnoses or chronic problems."
          />
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded border bg-card p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.icd10Code && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {c.icd10Code}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  {c.notes && <p className="mt-1 text-xs">{c.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddConditionDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const add = useAddCondition(patientId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateConditionInput, unknown, CreateConditionOutput>({
    resolver: zodResolver(createConditionSchema),
    defaultValues: { status: 'ACTIVE' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await add.mutateAsync(values);
    reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add condition</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Name" error={errors.name?.message}>
            <Input placeholder="hypertension" {...register('name')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="ICD-10" error={errors.icd10Code?.message}>
              <Input placeholder="I10" {...register('icd10Code')} />
            </FormField>
            <FormField label="Status" error={errors.status?.message}>
              <Select {...register('status')}>
                <option value="ACTIVE">Active</option>
                <option value="CHRONIC">Chronic</option>
                <option value="RESOLVED">Resolved</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Notes" error={errors.notes?.message}>
            <Input {...register('notes')} />
          </FormField>
          {add.error && (
            <p className="text-xs text-destructive">{(add.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || add.isPending}>
              {add.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
