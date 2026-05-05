'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
} from '@org/ui';
import { delegationsControllerListEligibleDelegatees } from '@org/api-client';
import { useQuery } from '@tanstack/react-query';
import { FormField } from '@/shared/components/forms/form-field';
import {
  createDelegationSchema,
  type CreateDelegationInput,
  type DelegationRecord,
} from '../schemas/delegation';
import {
  useCreateDelegation,
  useGrantedDelegations,
  useRevokeDelegation,
} from '../hooks/use-delegations';

interface Eligible {
  id: string;
  name: string;
  email: string;
  role: string;
}

function useEligibleDelegatees() {
  return useQuery({
    queryKey: ['delegations', 'eligible'],
    queryFn: async (): Promise<Eligible[]> => {
      const { data, error } = await delegationsControllerListEligibleDelegatees();
      if (error) throw new Error('Failed to load staff');
      return (data as unknown as Eligible[]) ?? [];
    },
  });
}

export function DelegationsCard() {
  const { data, isLoading, error } = useGrantedDelegations();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Delegations</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Grant temporary acting authority to a co-worker. They sign and
            process under your name; the audit log records both identities.
          </p>
        </div>
        <NewDelegationDialog />
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t granted any delegations.
          </p>
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((d) => (
              <DelegationItem key={d.id} delegation={d} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  REVOKED: 'bg-zinc-200 text-zinc-700',
  EXPIRED: 'bg-amber-100 text-amber-800',
};

function DelegationItem({ delegation: d }: { delegation: DelegationRecord }) {
  const revoke = useRevokeDelegation();
  const now = Date.now();
  const ended = new Date(d.endsAt).getTime() < now;
  const effectiveStatus =
    d.status === 'ACTIVE' && ended ? 'EXPIRED' : d.status;
  return (
    <li className="rounded border bg-card p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {d.delegatee?.name ?? d.delegateeId}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[effectiveStatus] ?? ''}`}
            >
              {effectiveStatus}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(d.startsAt).toLocaleString()} →{' '}
            {new Date(d.endsAt).toLocaleString()}
          </p>
          {d.reason && (
            <p className="mt-1 text-xs italic text-muted-foreground">{d.reason}</p>
          )}
          {d.scope.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Scope: {d.scope.join(', ')}
            </p>
          )}
        </div>
        {d.status === 'ACTIVE' && !ended && (
          <Button
            size="sm"
            variant="outline"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(d.id)}
            className="text-destructive hover:text-destructive"
          >
            Revoke
          </Button>
        )}
      </div>
    </li>
  );
}

function nowPlusHoursLocalIso(hours: number): string {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  // toLocaleString → "5/4/2026, 2:30:00 PM" — datetime-local needs YYYY-MM-DDTHH:mm.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewDelegationDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateDelegation();
  const eligible = useEligibleDelegatees();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateDelegationInput>({
    resolver: zodResolver(createDelegationSchema),
    defaultValues: {
      startsAt: new Date() as unknown as Date,
      endsAt: new Date(Date.now() + 8 * 60 * 60 * 1000) as unknown as Date,
    },
  });

  // Reset to fresh defaults each time the dialog opens.
  useEffect(() => {
    if (open) {
      reset({
        delegateeId: '',
        startsAt: new Date(nowPlusHoursLocalIso(0)) as unknown as Date,
        endsAt: new Date(nowPlusHoursLocalIso(8)) as unknown as Date,
        reason: '',
      });
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync({
      delegateeId: values.delegateeId,
      startsAt: new Date(values.startsAt as unknown as string),
      endsAt: new Date(values.endsAt as unknown as string),
      reason: values.reason,
    });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Grant delegation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant a delegation</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Delegate to" error={errors.delegateeId?.message}>
            <Select {...register('delegateeId')} disabled={eligible.isLoading}>
              <option value="">— select staff member —</option>
              {(eligible.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.role} · {e.email}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Starts" error={errors.startsAt?.message}>
              <Input
                type="datetime-local"
                {...register('startsAt' as never, { valueAsDate: true })}
              />
            </FormField>
            <FormField label="Ends" error={errors.endsAt?.message}>
              <Input
                type="datetime-local"
                {...register('endsAt' as never, { valueAsDate: true })}
              />
            </FormField>
          </div>
          <FormField label="Reason" error={errors.reason?.message}>
            <Input placeholder="Out for medical leave" {...register('reason')} />
          </FormField>
          {create.error && (
            <p className="text-xs text-destructive">
              {(create.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Grant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
