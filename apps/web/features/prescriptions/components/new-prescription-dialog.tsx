'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
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
} from '@org/ui';
import {
  createPrescriptionSchema,
  type CreatePrescriptionFormInput,
  type CreatePrescriptionInput,
  type InteractionFinding,
} from '../schemas/prescription';
import {
  useCreatePrescription,
  usePrecheckPrescription,
} from '../hooks/use-prescriptions';
import { PrescriptionItemRow } from './prescription-item-row';
import { SafetyFindings } from './safety-findings';
import { FormField } from '@/shared/components/forms/form-field';

interface Props {
  patientId: string;
  knownAllergies?: string[];
  currentMedications?: string[];
}

const EMPTY_ITEM = {
  drugName: '',
  dose: '',
  frequency: '',
  refills: 0,
};

export function NewPrescriptionDialog({
  patientId,
  knownAllergies,
  currentMedications,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New prescription</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Issue prescription</DialogTitle>
          <DialogDescription>
            Safety check runs before submission. Urgent findings block — override only when clinically justified.
          </DialogDescription>
        </DialogHeader>
        <PrescriptionForm
          patientId={patientId}
          knownAllergies={knownAllergies}
          currentMedications={currentMedications}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PrescriptionForm({
  patientId,
  knownAllergies,
  currentMedications,
  onDone,
}: Props & { onDone: () => void }) {
  const {
    register,
    handleSubmit,
    control,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreatePrescriptionFormInput, unknown, CreatePrescriptionInput>({
    resolver: zodResolver(createPrescriptionSchema),
    defaultValues: {
      patientId,
      knownAllergies,
      currentMedications,
      items: [EMPTY_ITEM],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const precheck = usePrecheckPrescription();
  const create = useCreatePrescription(patientId);
  const [findings, setFindings] = useState<InteractionFinding[] | null>(null);
  const [override, setOverride] = useState(false);

  const runPrecheck = async () => {
    // Coerce string/number form values through the schema before posting.
    const values = createPrescriptionSchema.parse(getValues());
    const result = await precheck.mutateAsync(values);
    setFindings(result.findings);
  };

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync({ ...values, override });
    onDone();
  });

  const blocking = findings?.some((f) => f.severity === 'urgent') ?? false;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {fields.map((field, idx) => (
          <PrescriptionItemRow
            key={field.id}
            index={idx}
            register={register}
            errors={errors}
            canRemove={fields.length > 1}
            onRemove={() => remove(idx)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(EMPTY_ITEM)}
        >
          + Add another drug
        </Button>
      </div>

      <FormField label="Notes" error={errors.notes?.message}>
        <Input placeholder="Optional notes for the patient" {...register('notes')} />
      </FormField>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Safety check
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runPrecheck}
            disabled={precheck.isPending}
          >
            {precheck.isPending ? 'Checking…' : findings ? 'Re-check' : 'Run safety check'}
          </Button>
        </div>
        {findings && <SafetyFindings findings={findings} />}
      </div>

      {blocking && (
        <label className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/5 p-3 text-xs">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Override blocking finding. By checking this, you acknowledge the
            clinical risk and accept responsibility — recorded in the audit log.
          </span>
        </label>
      )}

      {create.error && (
        <p className="text-xs text-destructive">{(create.error as Error).message}</p>
      )}

      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || create.isPending || (blocking && !override)}>
          {create.isPending ? 'Issuing…' : 'Issue prescription'}
        </Button>
      </DialogFooter>
    </form>
  );
}
