'use client';

import { Button } from '@org/ui';
import { useExportPatient } from '../hooks/use-patients';
import type { Patient } from '../schemas/patient';

/**
 * Triggers the DPA Sec 16 right-of-access bundle download. The api returns the
 * full patient JSON; the browser saves it as a file. The action is audit-logged
 * server-side.
 */
export function ExportPatientButton({ patient }: { patient: Patient }) {
  const exportPatient = useExportPatient();

  const handleClick = async () => {
    const bundle = await exportPatient.mutateAsync(patient.id);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `cliniq-export-${patient.mrn}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={exportPatient.isPending}
      title="Download a full record (DPA Sec 16 right-of-access)"
    >
      {exportPatient.isPending ? 'Exporting…' : 'Export'}
    </Button>
  );
}
