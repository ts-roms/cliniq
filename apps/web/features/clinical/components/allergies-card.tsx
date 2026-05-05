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
  Select,
  Loading,
  EmptyState,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  createAllergySchema,
  type Allergy,
  type CreateAllergyInput,
} from '../schemas/clinical';
import {
  useAddAllergy,
  useAllergies,
  useRemoveAllergy,
} from '../hooks/use-clinical';

const SEVERITY_TONE = {
  MILD: 'bg-emerald-100 text-emerald-800',
  MODERATE: 'bg-amber-100 text-amber-800',
  SEVERE: 'bg-rose-100 text-rose-800',
} as const;

export function AllergiesCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useAllergies(patientId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Allergies</CardTitle>
        <AddAllergyDialog patientId={patientId} />
      </CardHeader>
      <CardContent>
        {isLoading && <Loading />}
        {data && data.length === 0 && (
          <EmptyState
            title="No known allergies"
            description="Add one when the patient discloses something."
          />
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((a) => (
              <AllergyItem key={a.id} patientId={patientId} allergy={a} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AllergyItem({
  patientId,
  allergy,
}: {
  patientId: string;
  allergy: Allergy;
}) {
  const remove = useRemoveAllergy(patientId);
  return (
    <li className="flex items-start justify-between gap-3 rounded border bg-card p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{allergy.substance}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${SEVERITY_TONE[allergy.severity]}`}
          >
            {allergy.severity}
          </span>
          <span className="text-xs text-muted-foreground">{allergy.type}</span>
        </div>
        {allergy.reaction && (
          <p className="mt-1 text-xs text-muted-foreground">{allergy.reaction}</p>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={remove.isPending}
        onClick={() => remove.mutate(allergy.id)}
      >
        Remove
      </Button>
    </li>
  );
}

function AddAllergyDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const add = useAddAllergy(patientId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateAllergyInput>({
    resolver: zodResolver(createAllergySchema),
    defaultValues: { type: 'DRUG', severity: 'MODERATE' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await add.mutateAsync(values);
    reset();
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add allergy</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Substance" error={errors.substance?.message}>
            <Input placeholder="penicillin" {...register('substance')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type" error={errors.type?.message}>
              <Select {...register('type')}>
                <option value="DRUG">Drug</option>
                <option value="FOOD">Food</option>
                <option value="ENVIRONMENT">Environment</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
            <FormField label="Severity" error={errors.severity?.message}>
              <Select {...register('severity')}>
                <option value="MILD">Mild</option>
                <option value="MODERATE">Moderate</option>
                <option value="SEVERE">Severe</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Reaction" error={errors.reaction?.message}>
            <Input placeholder="anaphylaxis" {...register('reaction')} />
          </FormField>
          {add.error && (
            <p className="text-xs text-destructive">{(add.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || add.isPending}>
              {add.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
