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
} from '@org/ui';
import { createPatientSchema, type CreatePatientInput } from '../schemas/patient';
import { useCreatePatient } from '../hooks/use-patients';
import { PatientFormFields } from './patient-form-fields';

export function CreatePatientDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add patient</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New patient</DialogTitle>
          <DialogDescription>
            Required fields only. Add allergies, history, and contacts after creating.
          </DialogDescription>
        </DialogHeader>
        <CreatePatientForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreatePatientForm({ onDone }: { onDone: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePatientInput>({
    resolver: zodResolver(createPatientSchema),
    defaultValues: { sex: 'UNDISCLOSED' },
  });

  const create = useCreatePatient();

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset();
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <PatientFormFields register={register} errors={errors} />
      {create.error && (
        <p className="text-xs text-destructive">{(create.error as Error).message}</p>
      )}
      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create patient'}
        </Button>
      </DialogFooter>
    </form>
  );
}
