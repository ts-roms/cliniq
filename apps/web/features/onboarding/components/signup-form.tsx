'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, PasswordInput } from '@org/ui';
import {
  ALL_LAB_PLANS,
  ALL_PLANS,
  LAB_PLAN_META,
  PLAN_META,
  type LabPlan,
  type Plan,
} from '@org/shared-types';
import { FormField } from '@/shared/components/forms/form-field';
import {
  clinicStepSchema,
  ownerStepSchema,
  type ClinicStepInput,
  type OwnerStepInput,
} from '../schemas/signup';
import { useSignup } from '../hooks/use-signup';

type Step = 'clinic' | 'owner';
type Kind = 'CLINIC' | 'LAB';

function planFromQuery(value: string | null): Plan | null {
  if (!value) return null;
  return (ALL_PLANS as readonly string[]).includes(value) ? (value as Plan) : null;
}
function labPlanFromQuery(value: string | null): LabPlan | null {
  if (!value) return null;
  return (ALL_LAB_PLANS as readonly string[]).includes(value) ? (value as LabPlan) : null;
}

export function SignupForm() {
  const router = useRouter();
  const search = useSearchParams();
  const initialKind: Kind =
    search?.get('kind')?.toLowerCase() === 'lab' ? 'LAB' : 'CLINIC';
  const initialClinicPlan = planFromQuery(search?.get('plan') ?? null);
  const initialLabPlan = labPlanFromQuery(search?.get('plan') ?? null);

  const [kind, setKind] = useState<Kind>(initialKind);
  const [step, setStep] = useState<Step>('clinic');
  const [clinic, setClinic] = useState<ClinicStepInput | null>(null);
  const [plan, setPlan] = useState<Plan>(initialClinicPlan ?? 'STARTER');
  const [labPlan, setLabPlan] = useState<LabPlan>(initialLabPlan ?? 'LAB_BASIC');

  const signup = useSignup({
    onSuccess: () => router.push(kind === 'LAB' ? '/lab/cases' : '/patients'),
  });

  return (
    <>
      <SelectedPlanPill
        kind={kind}
        onKindChange={setKind}
        clinicPlan={plan}
        onClinicPlanChange={setPlan}
        labPlan={labPlan}
        onLabPlanChange={setLabPlan}
      />
      {step === 'clinic' || !clinic ? (
        <ClinicStep
          kind={kind}
          defaultValues={clinic ?? undefined}
          onNext={(values) => {
            setClinic(values);
            setStep('owner');
          }}
        />
      ) : (
        <OwnerStep
          kind={kind}
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
              kind,
              plan: kind === 'CLINIC' ? plan : undefined,
              labPlan: kind === 'LAB' ? labPlan : undefined,
            })
          }
        />
      )}
    </>
  );
}

function SelectedPlanPill({
  kind,
  onKindChange,
  clinicPlan,
  onClinicPlanChange,
  labPlan,
  onLabPlanChange,
}: {
  kind: Kind;
  onKindChange: (k: Kind) => void;
  clinicPlan: Plan;
  onClinicPlanChange: (p: Plan) => void;
  labPlan: LabPlan;
  onLabPlanChange: (p: LabPlan) => void;
}) {
  const isLab = kind === 'LAB';
  const meta = isLab ? LAB_PLAN_META[labPlan] : PLAN_META[clinicPlan];
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-border/60 bg-background p-0.5">
          <SmallTab active={!isLab} onClick={() => onKindChange('CLINIC')}>
            Clinic
          </SmallTab>
          <SmallTab active={isLab} onClick={() => onKindChange('LAB')}>
            Lab
          </SmallTab>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Selected plan
          </p>
          <p className="text-sm font-medium">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.tagline}</p>
        </div>
        {isLab ? (
          <select
            value={labPlan}
            onChange={(e) => onLabPlanChange(e.target.value as LabPlan)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            aria-label="Change lab plan"
          >
            {ALL_LAB_PLANS.map((id) => (
              <option key={id} value={id}>
                {LAB_PLAN_META[id].label}
              </option>
            ))}
          </select>
        ) : (
          <select
            value={clinicPlan}
            onChange={(e) => onClinicPlanChange(e.target.value as Plan)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            aria-label="Change clinic plan"
          >
            {ALL_PLANS.map((id) => (
              <option key={id} value={id}>
                {PLAN_META[id].label}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Free 30-day trial. Switch tiers any time from the platform console.
      </p>
    </div>
  );
}

function SmallTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full px-3 py-1 text-xs font-medium transition ' +
        (active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}

function ClinicStep({
  kind,
  defaultValues,
  onNext,
}: {
  kind: Kind;
  defaultValues?: ClinicStepInput;
  onNext: (v: ClinicStepInput) => void;
}) {
  const isLab = kind === 'LAB';
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
      <FormField
        label={isLab ? 'Laboratory name' : 'Clinic name'}
        error={errors.clinicName?.message}
      >
        <Input
          placeholder={isLab ? 'Northern Dental Lab' : 'Acme Family Clinic'}
          {...register('clinicName')}
        />
      </FormField>
      <FormField label="URL slug" error={errors.slug?.message}>
        <div className="flex items-center gap-2">
          <Input
            placeholder={isLab ? 'northern-dental' : 'acme'}
            className="flex-1"
            {...register('slug')}
          />
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
  kind,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  kind: Kind;
  onBack: () => void;
  onSubmit: (v: OwnerStepInput) => void;
  submitting: boolean;
  error: string | null;
}) {
  const isLab = kind === 'LAB';
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
        <Input
          placeholder={isLab ? 'Jane Cruz' : 'Dr. Juana Cruz'}
          autoComplete="name"
          {...register('ownerName')}
        />
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
          {submitting ? 'Creating…' : `Create ${isLab ? 'lab' : 'clinic'} & sign in`}
        </Button>
      </div>
    </form>
  );
}
