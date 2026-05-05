'use client';

import { useState } from 'react';
import {
  CreatePatientDialog,
  PatientsEmpty,
  PatientsSearch,
  PatientsTable,
  usePatientList,
} from '@/features/patients';

export default function PatientsPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch, isFetching } = usePatientList(q);

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} total` : 'Loading…'}
          </p>
        </div>
        <CreatePatientDialog />
      </header>

      <PatientsSearch
        value={q}
        onChange={setQ}
        onRefresh={() => refetch()}
        isFetching={isFetching}
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading patients…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && data.items.length === 0 && <PatientsEmpty q={q} />}
      {data && data.items.length > 0 && <PatientsTable items={data.items} />}
    </div>
  );
}
