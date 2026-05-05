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
import {
  createMembershipSchema,
  type CreateMembershipInput,
} from '../schemas/hmo';
import { useAddMembership, useProviders } from '../hooks/use-hmo';

export function AddMembershipDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const providers = useProviders();
  const add = useAddMembership(patientId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateMembershipInput>({
    resolver: zodResolver(createMembershipSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    await add.mutateAsync(values);
    reset();
    setOpen(false);
  });

  const activeProviders = providers.data?.filter((p) => p.active) ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={activeProviders.length === 0}>
          Add HMO card
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add HMO membership</DialogTitle>
        </DialogHeader>
        {activeProviders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No HMO providers configured. Add one in Admin → HMO Claims first.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <FormField label="Provider" error={errors.providerId?.message}>
              <Select {...register('providerId')}>
                <option value="">Select…</option>
                {activeProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Member ID / card number" error={errors.memberId?.message}>
              <Input placeholder="MX-123456789" {...register('memberId')} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Valid from" error={errors.validFrom?.message}>
                <Input type="date" {...register('validFrom')} />
              </FormField>
              <FormField label="Valid until" error={errors.validUntil?.message}>
                <Input type="date" {...register('validUntil')} />
              </FormField>
            </div>
            {add.error && (
              <p className="text-xs text-destructive">{(add.error as Error).message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || add.isPending}>
                {add.isPending ? 'Saving…' : 'Save card'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
