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
  Loading,
  EmptyState,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  createVitalSchema,
  type CreateVitalInput,
  type CreateVitalOutput,
  type Vital,
} from '../schemas/clinical';
import { useAddVital, useVitals } from '../hooks/use-clinical';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function bp(v: Vital): string {
  if (v.systolic && v.diastolic) return `${v.systolic}/${v.diastolic}`;
  return '—';
}

export function VitalsCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useVitals(patientId);
  const latest = data?.[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Vitals</CardTitle>
        <AddVitalDialog patientId={patientId} />
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {data && data.length === 0 && (
          <EmptyState
            title="No vitals on file"
            description="Record vitals from the patient's latest visit."
          />
        )}
        {latest && (
          <>
            <div className="mb-3 grid grid-cols-3 gap-3">
              <Stat label="BP" value={bp(latest)} unit="mmHg" />
              <Stat label="HR" value={latest.heartRate ?? '—'} unit="bpm" />
              <Stat label="SpO₂" value={latest.spo2 ?? '—'} unit="%" />
              <Stat label="Temp" value={latest.tempC ?? '—'} unit="°C" />
              <Stat label="Weight" value={latest.weightKg ?? '—'} unit="kg" />
              <Stat label="BMI" value={latest.bmi ?? '—'} unit="" />
            </div>
            {data && data.length > 1 && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  History ({data.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {data.slice(1, 6).map((v) => (
                    <li key={v.id} className="flex justify-between">
                      <span>{formatDateTime(v.recordedAt)}</span>
                      <span className="font-mono">
                        BP {bp(v)} · HR {v.heartRate ?? '—'} · SpO₂ {v.spo2 ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="rounded border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

function AddVitalDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const add = useAddVital(patientId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateVitalInput, unknown, CreateVitalOutput>({
    resolver: zodResolver(createVitalSchema),
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
          Record
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record vitals</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Systolic">
              <Input type="number" {...register('systolic')} />
            </FormField>
            <FormField label="Diastolic">
              <Input type="number" {...register('diastolic')} />
            </FormField>
            <FormField label="Heart rate">
              <Input type="number" {...register('heartRate')} />
            </FormField>
            <FormField label="Resp rate">
              <Input type="number" {...register('respRate')} />
            </FormField>
            <FormField label="Temp (°C)">
              <Input type="number" step="0.1" {...register('tempC')} />
            </FormField>
            <FormField label="SpO₂ (%)">
              <Input type="number" {...register('spo2')} />
            </FormField>
            <FormField label="Weight (kg)">
              <Input type="number" step="0.1" {...register('weightKg')} />
            </FormField>
            <FormField label="Height (cm)">
              <Input type="number" step="0.1" {...register('heightCm')} />
            </FormField>
            <FormField label="Pain (0–10)">
              <Input type="number" {...register('painScore')} />
            </FormField>
          </div>
          {errors.root?.message && (
            <p className="text-xs text-destructive">{errors.root.message}</p>
          )}
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
