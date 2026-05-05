'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { formatCentavos } from '@/features/billing';
import {
  recordPaymentSchema,
  updateClaimSchema,
  type HmoClaim,
  type RecordPaymentInput,
  type RecordPaymentOutput,
  type UpdateClaimInput,
  type UpdateClaimOutput,
} from '../schemas/hmo';
import { useRecordHmoPayment, useUpdateClaim } from '../hooks/use-hmo';

export function ClaimActions({ claim }: { claim: HmoClaim }) {
  if (claim.status === 'PAID') return <span className="text-xs text-emerald-700">paid</span>;
  if (claim.status === 'DENIED' || claim.status === 'CANCELLED') {
    return <span className="text-xs text-muted-foreground">closed</span>;
  }
  const canRecordPayment = claim.status === 'APPROVED' || claim.status === 'PARTIAL';
  return (
    <div className="flex justify-end gap-1">
      <UpdateClaimDialog claim={claim} />
      {canRecordPayment && <RecordHmoPaymentDialog claim={claim} />}
    </div>
  );
}

function UpdateClaimDialog({ claim }: { claim: HmoClaim }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateClaim();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateClaimInput, unknown, UpdateClaimOutput>({
    resolver: zodResolver(updateClaimSchema),
    defaultValues: {
      status: claim.status,
      authNumber: claim.authNumber ?? undefined,
      approvedCentavos: claim.approvedCentavos,
      patientResponsibilityCentavos: claim.patientResponsibilityCentavos,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await update.mutateAsync({ id: claim.id, input: values });
    reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Update
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update {claim.number}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Claimed: {formatCentavos(claim.claimedCentavos)}
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Status" error={errors.status?.message}>
            <Select {...register('status')}>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="PARTIAL">Partial</option>
              <option value="DENIED">Denied</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </FormField>
          <FormField label="Auth number" error={errors.authNumber?.message}>
            <Input placeholder="HMO approval no." {...register('authNumber')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Approved (centavos)" error={errors.approvedCentavos?.message}>
              <Input type="number" {...register('approvedCentavos')} />
            </FormField>
            <FormField
              label="Patient responsibility"
              error={errors.patientResponsibilityCentavos?.message}
            >
              <Input type="number" {...register('patientResponsibilityCentavos')} />
            </FormField>
          </div>
          <FormField label="Denial reason" error={errors.denialReason?.message}>
            <Input {...register('denialReason')} />
          </FormField>
          {update.error && (
            <p className="text-xs text-destructive">{(update.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordHmoPaymentDialog({ claim }: { claim: HmoClaim }) {
  const [open, setOpen] = useState(false);
  const record = useRecordHmoPayment();
  const remainingOnInvoice = claim.invoice
    ? Math.max(claim.invoice.totalCentavos - claim.invoice.paidCentavos, 0)
    : claim.approvedCentavos;
  const default_ = Math.min(claim.approvedCentavos || 0, remainingOnInvoice);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentInput, unknown, RecordPaymentOutput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { amountCentavos: default_ },
  });

  const onSubmit = handleSubmit(async (values) => {
    await record.mutateAsync({ id: claim.id, input: values });
    reset({ amountCentavos: default_ });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Record HMO pmt</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record HMO payout for {claim.number}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Approved {formatCentavos(claim.approvedCentavos)} · Invoice balance{' '}
          {formatCentavos(remainingOnInvoice)}
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Amount (centavos)" error={errors.amountCentavos?.message}>
            <Input type="number" {...register('amountCentavos')} />
          </FormField>
          <FormField label="HMO reference / PRA #" error={errors.reference?.message}>
            <Input {...register('reference')} />
          </FormField>
          {record.error && (
            <p className="text-xs text-destructive">{(record.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || record.isPending}>
              {record.isPending ? 'Saving…' : 'Save payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
