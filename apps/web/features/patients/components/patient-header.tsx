import Link from 'next/link';
import { Button } from '@org/ui';
import { EditPatientDialog } from './edit-patient-dialog';
import { DeletePatientButton } from './delete-patient-button';
import { ExportPatientButton } from './export-patient-button';
import { FileDsrDialog } from '@/features/dsr';
import type { Patient } from '../schemas/patient';

interface Props {
  patient: Patient;
  onStartConsult: () => void;
  isStarting: boolean;
}

export function PatientHeader({ patient: p, onStartConsult, isStarting }: Props) {
  return (
    <div className="mb-6">
      <Link href="/patients" className="text-sm text-muted-foreground hover:text-foreground">
        ← All patients
      </Link>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extralight tracking-tight sm:text-2xl">
            {p.lastName}, {p.firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            MRN <span className="font-mono">{p.mrn}</span> · {p.sex} ·{' '}
            {new Date(p.dateOfBirth).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportPatientButton patient={p} />
          <FileDsrDialog patientId={p.id} />
          <DeletePatientButton patient={p} />
          <EditPatientDialog patient={p} />
          <Button onClick={onStartConsult} disabled={isStarting}>
            {isStarting ? 'Starting…' : 'Start consultation'}
          </Button>
        </div>
      </div>
    </div>
  );
}
