'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { formatCentavos, type Invoice } from '@/features/billing';
import {
  fileClaimSchema,
  type FileClaimInput,
  type FileClaimOutput,
} from '../schemas/hmo';
import { useFileClaim, useMemberships } from '../hooks/use-hmo';

export function FileClaimDialog({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  const memberships = useMemberships(invoice.patientId);
  const file = useFileClaim(invoice.id);

  const remaining = Math.max(invoice.totalCentavos - invoice.paidCentavos, 0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FileClaimInput, unknown, FileClaimOutput>({
    resolver: zodResolver(fileClaimSchema),
    defaultValues: { claimedCentavos: remaining },
  });

  const onSubmit = handleSubmit(async (values) => {
    await file.mutateAsync(values);
    reset({ claimedCentavos: remaining });
    setOpen(false);
  });

  if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') return null;

  const active = memberships.data?.filter((m) => m.active) ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          File HMO claim
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File HMO claim for {invoice.number}</DialogTitle>
          <DialogDescription>
            Outstanding balance: <strong>{formatCentavos(remaining)}</strong>
          </DialogDescription>
        </DialogHeader>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active HMO memberships for this patient. Add one from their profile first.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <FormField label="Membership" error={errors.membershipId?.message}>
              <Select {...register('membershipId')}>
                <option value="">Select…</option>
                {active.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.provider.name} · {m.memberId}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Claimed amount (centavos)" error={errors.claimedCentavos?.message}>
              <Input type="number" {...register('claimedCentavos')} />
            </FormField>
            <FormField label="Notes" error={errors.notes?.message}>
              <Input {...register('notes')} />
            </FormField>
            {file.error && (
              <p className="text-xs text-destructive">{(file.error as Error).message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || file.isPending}>
                {file.isPending ? 'Submitting…' : 'Submit claim'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
