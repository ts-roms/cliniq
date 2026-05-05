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
import { useUpdatePatient } from '../hooks/use-patients';
import { PatientFormFields } from './patient-form-fields';
import type { Patient } from '../schemas/patient';

interface Props {
  patient: Patient;
}

export function EditPatientDialog({ patient }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit patient</DialogTitle>
          <DialogDescription>
            Updates apply immediately. Audit log records who changed what.
          </DialogDescription>
        </DialogHeader>
        <EditPatientForm patient={patient} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditPatientForm({ patient, onDone }: { patient: Patient; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CreatePatientInput>({
    resolver: zodResolver(createPatientSchema),
    defaultValues: {
      mrn: patient.mrn,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth.slice(0, 10), // YYYY-MM-DD for <input type=date>
      sex: patient.sex,
      email: patient.email ?? '',
      phone: patient.phone ?? '',
    },
  });

  const update = useUpdatePatient(patient.id);

  const onSubmit = handleSubmit(async (values) => {
    await update.mutateAsync(values);
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <PatientFormFields register={register} errors={errors} />
      {update.error && (
        <p className="text-xs text-destructive">{(update.error as Error).message}</p>
      )}
      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || update.isPending || !isDirty}
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}
