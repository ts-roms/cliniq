import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import type { Patient } from '../schemas/patient';

export function PatientContactCard({ patient: p }: { patient: Patient }) {
  return (
    <Card className="md:col-span-1">
      <CardHeader>
        <CardTitle className="text-base">Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <Row label="Email" value={p.email} />
        <Row label="Phone" value={p.phone} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value || '—'}</span>
    </div>
  );
}
