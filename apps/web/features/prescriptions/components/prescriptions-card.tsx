'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Loading,
  EmptyState,
} from '@org/ui';
import {
  useCancelPrescription,
  usePrescriptionsForPatient,
} from '../hooks/use-prescriptions';
import { NewPrescriptionDialog } from './new-prescription-dialog';
import type { Prescription } from '../schemas/prescription';

interface Props {
  patientId: string;
  knownAllergies?: string[];
  currentMedications?: string[];
}

export function PrescriptionsCard({
  patientId,
  knownAllergies,
  currentMedications,
}: Props) {
  const list = usePrescriptionsForPatient(patientId);
  const cancel = useCancelPrescription(patientId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Prescriptions</CardTitle>
        <NewPrescriptionDialog
          patientId={patientId}
          knownAllergies={knownAllergies}
          currentMedications={currentMedications}
        />
      </CardHeader>
      <CardContent className="space-y-2">
        {list.isLoading && <Loading />}
        {list.data?.length === 0 && (
          <EmptyState
            title="No prescriptions yet"
            description="Issue from the consultation page."
          />
        )}
        {list.data?.map((rx) => (
          <PrescriptionRow
            key={rx.id}
            rx={rx}
            isCancelling={cancel.isPending && cancel.variables === rx.id}
            onCancel={() => cancel.mutate(rx.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PrescriptionRow({
  rx,
  isCancelling,
  onCancel,
}: {
  rx: Prescription;
  isCancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="rounded border px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs">{rx.number}</span>
        <span className="text-xs text-muted-foreground">
          {rx.status} · {new Date(rx.issuedAt).toLocaleDateString()}
        </span>
      </div>
      <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground">
        {rx.items.map((item) => (
          <li key={item.id}>
            {item.drugName}
            {item.strength ? ` ${item.strength}` : ''} — {item.dose} {item.frequency}
            {item.durationDays ? ` × ${item.durationDays}d` : ''}
          </li>
        ))}
      </ul>
      {rx.status === 'ISSUED' && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={isCancelling}>
            {isCancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        </div>
      )}
    </div>
  );
}
