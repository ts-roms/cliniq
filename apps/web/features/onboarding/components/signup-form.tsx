'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, PasswordInput } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  clinicStepSchema,
  ownerStepSchema,
  type ClinicStepInput,
  type OwnerStepInput,
} from '../schemas/signup';
import { useSignup } from '../hooks/use-signup';

type Step = 'clinic' | 'owner';

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('clinic');
  const [clinic, setClinic] = useState<ClinicStepInput | null>(null);

  const signup = useSignup({ onSuccess: () => router.push('/patients') });

  return step === 'clinic' || !clinic ? (
    <ClinicStep
      defaultValues={clinic ?? undefined}
      onNext={(values) => {
        setClinic(values);
        setStep('owner');
      }}
    />
  ) : (
    <OwnerStep
      onBack={() => setStep('clinic')}
      submitting={signup.isPending}
      error={signup.error ? (signup.error as Error).message : null}
      onSubmit={(owner) =>
        signup.mutate({
          clinicName: clinic.clinicName,
          slug: clinic.slug,
          ownerName: owner.ownerName,
          ownerEmail: owner.ownerEmail,
          password: owner.password,
        })
      }
    />
  );
}

function ClinicStep({
  defaultValues,
  onNext,
}: {
  defaultValues?: ClinicStepInput;
  onNext: (v: ClinicStepInput) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClinicStepInput>({
    resolver: zodResolver(clinicStepSchema),
    defaultValues,
  });
  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Step 1 of 2
      </p>
      <FormField label="Clinic name" error={errors.clinicName?.message}>
        <Input placeholder="Acme Family Clinic" {...register('clinicName')} />
      </FormField>
      <FormField
        label="URL slug"
        error={errors.slug?.message}
      >
        <div className="flex items-center gap-2">
          <Input placeholder="acme" className="flex-1" {...register('slug')} />
          <span className="text-xs text-muted-foreground">.cliniq.app</span>
        </div>
      </FormField>
      <Button type="submit" className="w-full">
        Continue
      </Button>
    </form>
  );
}

function OwnerStep({
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  onBack: () => void;
  onSubmit: (v: OwnerStepInput) => void;
  submitting: boolean;
  error: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OwnerStepInput>({ resolver: zodResolver(ownerStepSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Step 2 of 2
      </p>
      <FormField label="Your name" error={errors.ownerName?.message}>
        <Input placeholder="Dr. Juana Cruz" autoComplete="name" {...register('ownerName')} />
      </FormField>
      <FormField label="Email" error={errors.ownerEmail?.message}>
        <Input type="email" autoComplete="email" {...register('ownerEmail')} />
      </FormField>
      <FormField label="Password" error={errors.password?.message}>
        <PasswordInput autoComplete="new-password" {...register('password')} />
      </FormField>
      <FormField label="Confirm password" error={errors.confirmPassword?.message}>
        <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
      </FormField>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting || submitting}>
          {submitting ? 'Creating clinic…' : 'Create clinic & sign in'}
        </Button>
      </div>
    </form>
  );
}
