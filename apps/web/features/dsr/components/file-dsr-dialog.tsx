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
import { fileDsrSchema, type FileDsrInput } from '../schemas/dsr';
import { useFileDsr } from '../hooks/use-dsr';

export function FileDsrDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const file = useFileDsr();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FileDsrInput>({
    resolver: zodResolver(fileDsrSchema),
    defaultValues: { patientId, type: 'ACCESS' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await file.mutateAsync(values);
    reset({ patientId, type: 'ACCESS', details: '' });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          File DPA request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File data subject request</DialogTitle>
          <DialogDescription>
            Per Data Privacy Act §16. Routed to your DPO for resolution.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Type" error={errors.type?.message}>
            <Select {...register('type')}>
              <option value="ACCESS">Access — copy of records</option>
              <option value="CORRECTION">Correction — fix inaccurate data</option>
              <option value="ERASURE">Erasure — delete data</option>
              <option value="OBJECTION">Objection — to processing</option>
              <option value="PORTABILITY">Portability — machine-readable export</option>
            </Select>
          </FormField>
          <FormField label="Details" error={errors.details?.message}>
            <Input
              placeholder="What needs to change / why?"
              {...register('details')}
            />
          </FormField>
          {file.error && (
            <p className="text-xs text-destructive">{(file.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || file.isPending}>
              {file.isPending ? 'Filing…' : 'File request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
