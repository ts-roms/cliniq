'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@org/ui';
import { useDeletePatient } from '../hooks/use-patients';
import type { Patient } from '../schemas/patient';

interface Props {
  patient: Patient;
  /** Where to navigate after a successful delete. Defaults to /patients. */
  redirectTo?: string;
}

export function DeletePatientButton({ patient, redirectTo = '/patients' }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const remove = useDeletePatient();

  const confirmText = `${patient.lastName.toUpperCase()}, ${patient.firstName}`;
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === confirmText;

  const onDelete = async () => {
    await remove.mutateAsync(patient.id);
    setOpen(false);
    router.replace(redirectTo);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete patient</DialogTitle>
          <DialogDescription>
            Soft-deletes the patient record. Audit log preserves who deleted it.
            Type the patient&apos;s name to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="font-mono text-xs text-muted-foreground">{confirmText}</p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type the name above"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {remove.error && (
            <p className="text-xs text-destructive">{(remove.error as Error).message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={!matches || remove.isPending}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
