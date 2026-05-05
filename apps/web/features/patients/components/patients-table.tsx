import Link from 'next/link';
import { memo } from 'react';
import { Card } from '@org/ui';
import type { Patient } from '../schemas/patient';

export const PatientsTable = memo(function PatientsTable({
  items,
}: {
  items: Patient[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 sm:px-6">MRN</th>
              <th className="px-4 py-3 sm:px-6">Name</th>
              <th className="px-4 py-3 sm:px-6">DOB</th>
              <th className="px-4 py-3 sm:px-6">Sex</th>
              <th className="px-4 py-3 sm:px-6">Phone</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <PatientRow key={p.id} patient={p} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
});

const PatientRow = memo(function PatientRow({ patient: p }: { patient: Patient }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3 font-mono text-xs sm:px-6">
        <Link href={`/patients/${p.id}`} className="text-primary hover:underline">
          {p.mrn}
        </Link>
      </td>
      <td className="px-4 py-3 sm:px-6">
        <Link href={`/patients/${p.id}`} className="hover:underline">
          {p.lastName}, {p.firstName}
        </Link>
      </td>
      <td className="px-4 py-3 tabular-nums sm:px-6">
        {new Date(p.dateOfBirth).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 sm:px-6">{p.sex}</td>
      <td className="px-4 py-3 tabular-nums sm:px-6">{p.phone ?? '—'}</td>
    </tr>
  );
});
