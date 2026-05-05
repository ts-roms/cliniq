'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Loading,
} from '@org/ui';
import { CONSENT_LABELS, CONSENT_ORDER, type ConsentType } from '../schemas/consent';
import { usePatientConsents, useSetConsent } from '../hooks/use-consents';

interface Props {
  patientId: string;
}

export function ConsentsCard({ patientId }: Props) {
  const list = usePatientConsents(patientId);
  const setConsent = useSetConsent(patientId);

  const byType = useMemo(() => {
    const map = new Map<ConsentType, ReturnType<typeof list.data extends infer T ? () => T : never>>();
    list.data?.forEach((row) => {
      map.set(row.type as ConsentType, row as never);
    });
    return map;
  }, [list.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.isLoading && <Loading />}
        {list.data &&
          CONSENT_ORDER.map((type) => (
            <ConsentRow
              key={type}
              type={type}
              row={byType.get(type) as never}
              onChange={(granted, reason) =>
                setConsent.mutate({ type, granted, withdrawalReason: reason })
              }
              busy={setConsent.isPending && setConsent.variables?.type === type}
            />
          ))}
      </CardContent>
    </Card>
  );
}

interface RowProps {
  type: ConsentType;
  row?: { granted: boolean; acceptedAt: string | null; withdrawnAt: string | null };
  onChange: (granted: boolean, reason?: string) => void;
  busy: boolean;
}

function ConsentRow({ type, row, onChange, busy }: RowProps) {
  const meta = CONSENT_LABELS[type];
  const granted = row?.granted ?? false;
  const required = type === 'TREATMENT';
  const [reason, setReason] = useState('');
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  const handleToggle = () => {
    if (granted && !required) {
      setConfirmingWithdraw(true);
      return;
    }
    onChange(true);
  };

  return (
    <div className="rounded border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {meta.label}
            {required && (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                required
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{meta.help}</p>
          <ConsentMeta row={row} />
        </div>
        <Button
          size="sm"
          variant={granted ? 'outline' : 'default'}
          onClick={handleToggle}
          disabled={busy || (required && granted)}
        >
          {busy ? '…' : granted ? 'Revoke' : 'Grant'}
        </Button>
      </div>
      {confirmingWithdraw && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for withdrawing (audit-logged)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmingWithdraw(false);
                setReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={reason.length < 3 || busy}
              onClick={() => {
                onChange(false, reason);
                setConfirmingWithdraw(false);
                setReason('');
              }}
            >
              Confirm withdraw
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsentMeta({
  row,
}: {
  row?: { acceptedAt: string | null; withdrawnAt: string | null };
}) {
  if (!row) {
    return <p className="mt-1 text-[11px] text-muted-foreground">Not yet recorded</p>;
  }
  if (row.withdrawnAt) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        Withdrawn {new Date(row.withdrawnAt).toLocaleDateString()}
      </p>
    );
  }
  if (row.acceptedAt) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        Granted {new Date(row.acceptedAt).toLocaleDateString()}
      </p>
    );
  }
  return null;
}
