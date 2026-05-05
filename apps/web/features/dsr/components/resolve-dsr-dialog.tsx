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
  resolveDsrSchema,
  type Dsr,
  type ResolveDsrInput,
} from '../schemas/dsr';
import { useResolveDsr } from '../hooks/use-dsr';

export function ResolveDsrDialog({ dsr }: { dsr: Dsr }) {
  const [open, setOpen] = useState(false);
  const resolve = useResolveDsr();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResolveDsrInput>({
    resolver: zodResolver(resolveDsrSchema),
    defaultValues: { status: 'RESOLVED' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await resolve.mutateAsync({ id: dsr.id, input: values });
    reset();
    setOpen(false);
  });

  if (dsr.status === 'RESOLVED' || dsr.status === 'REJECTED') return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Resolve</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve request</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Status" error={errors.status?.message}>
            <Select {...register('status')}>
              <option value="RESOLVED">Resolved</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="REJECTED">Rejected (with reason)</option>
            </Select>
          </FormField>
          <FormField label="Resolution / reason" error={errors.resolution?.message}>
            <Input
              placeholder="Action taken or basis for rejection"
              {...register('resolution')}
            />
          </FormField>
          {resolve.error && (
            <p className="text-xs text-destructive">
              {(resolve.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || resolve.isPending}>
              {resolve.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
