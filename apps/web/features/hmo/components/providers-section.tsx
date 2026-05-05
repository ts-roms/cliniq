'use client';

import { useState } from 'react';
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
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  createProviderSchema,
  type CreateProviderInput,
} from '../schemas/hmo';
import { useCreateProvider, useProviders } from '../hooks/use-hmo';

export function ProvidersSection() {
  const { data, isLoading } = useProviders();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>HMO providers</CardTitle>
        <NewProviderDialog />
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No providers configured. Add Maxicare, Medicard, PhilHealth, etc. to start filing claims.
          </p>
        )}
        {data && data.length > 0 && (
          <ul className="divide-y">
            {data.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.payerCode ?? 'no payer code'}
                    {p.contactEmail && ` · ${p.contactEmail}`}
                  </p>
                </div>
                {!p.active && (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
                    inactive
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function NewProviderDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateProvider();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProviderInput>({
    resolver: zodResolver(createProviderSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add provider
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add HMO provider</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Name" error={errors.name?.message}>
            <Input placeholder="Maxicare" {...register('name')} />
          </FormField>
          <FormField label="Payer code" error={errors.payerCode?.message}>
            <Input placeholder="MX-001" {...register('payerCode')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Contact phone" error={errors.contactPhone?.message}>
              <Input {...register('contactPhone')} />
            </FormField>
            <FormField label="Contact email" error={errors.contactEmail?.message}>
              <Input type="email" {...register('contactEmail')} />
            </FormField>
          </div>
          {create.error && (
            <p className="text-xs text-destructive">{(create.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || create.isPending}>
              {create.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
