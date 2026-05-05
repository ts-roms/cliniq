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
  createMedicationSchema,
  type CreateMedicationInput,
  type CreateMedicationOutput,
} from '../schemas/clinical';
import { useAddMedication, useMedications } from '../hooks/use-clinical';

const STATUS_TONE = {
  ACTIVE: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-zinc-200 text-zinc-700',
  STOPPED: 'bg-rose-100 text-rose-800',
} as const;

export function MedicationsCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useMedications(patientId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Medications</CardTitle>
        <AddMedicationDialog patientId={patientId} />
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {data && data.length === 0 && (
          <EmptyState
            title="No active medications"
            description="Add a current prescription to track adherence."
          />
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-3 rounded border bg-card p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.drugName}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[m.status]}`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[m.dose, m.frequency].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {m.notes && <p className="mt-1 text-xs">{m.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddMedicationDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const add = useAddMedication(patientId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateMedicationInput, unknown, CreateMedicationOutput>({
    resolver: zodResolver(createMedicationSchema),
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
          <DialogTitle>Add medication</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Drug" error={errors.drugName?.message}>
            <Input placeholder="metformin" {...register('drugName')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Dose" error={errors.dose?.message}>
              <Input placeholder="500mg" {...register('dose')} />
            </FormField>
            <FormField label="Frequency" error={errors.frequency?.message}>
              <Input placeholder="BID" {...register('frequency')} />
            </FormField>
          </div>
          <FormField label="Status" error={errors.status?.message}>
            <Select {...register('status')}>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="STOPPED">Stopped</option>
            </Select>
          </FormField>
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
