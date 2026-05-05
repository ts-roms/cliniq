'use client';

import {
  Card, CardContent, CardHeader, CardTitle,
  Loading,
  EmptyState,
} from '@org/ui';
import { useMemberships } from '../hooks/use-hmo';
import { AddMembershipDialog } from './add-membership-dialog';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function HmoCardsCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useMemberships(patientId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>HMO cards</CardTitle>
        <AddMembershipDialog patientId={patientId} />
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {data && data.length === 0 && (
          <EmptyState
            title="No HMO memberships"
            description="Add the patient's HMO card to enable claims."
          />
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((m) => (
              <li key={m.id} className="rounded border bg-card p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{m.provider.name}</span>
                  {m.provider.payerCode && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {m.provider.payerCode}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Member <span className="font-mono">{m.memberId}</span> · Valid{' '}
                  {formatDate(m.validFrom)} → {formatDate(m.validUntil)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
