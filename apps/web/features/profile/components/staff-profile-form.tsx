'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  staffProfileSchema,
  type StaffProfile,
  type StaffProfileInput,
  type StaffProfileOutput,
} from '../schemas/profile';
import { useUpdateStaffProfile } from '../hooks/use-profile';

const PRESCRIBER_ROLES = new Set(['DOCTOR', 'OWNER', 'ADMIN']);

/** YYYY-MM-DD for <input type="date">, '' when unset. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function toFormValues(profile: StaffProfile): StaffProfileInput {
  return {
    name: profile.name,
    prcLicenseNumber: profile.prcLicenseNumber ?? '',
    prcLicenseExpiry: toDateInput(profile.prcLicenseExpiry),
    prcSpecialty: profile.prcSpecialty ?? '',
  };
}

export function StaffProfileForm({ profile }: { profile: StaffProfile }) {
  const update = useUpdateStaffProfile();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<StaffProfileInput, unknown, StaffProfileOutput>({
    resolver: zodResolver(staffProfileSchema),
    defaultValues: toFormValues(profile),
  });

  // Re-sync after a save (or a refetch) so isDirty reflects the server row.
  useEffect(() => {
    reset(toFormValues(profile));
  }, [profile, reset]);

  const expired =
    !!profile.prcLicenseExpiry &&
    new Date(profile.prcLicenseExpiry).getTime() < Date.now();
  const canPrescribe = PRESCRIBER_ROLES.has(profile.role);

  return (
    <form
      onSubmit={handleSubmit((values) => update.mutate(values))}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Email">
            <Input value={profile.email} disabled readOnly />
          </FormField>
          <FormField label="Display name" error={errors.name?.message}>
            <Input {...register('name')} autoComplete="name" />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Role: {profile.role}. Roles are changed by an owner or admin under
            Settings → Team.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PRC licence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canPrescribe && !profile.prcLicenseNumber && (
            <p
              role="status"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
            >
              Prescriptions can only be issued once a PRC licence number is on
              file.
            </p>
          )}
          {expired && (
            <p
              role="status"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              This licence expired on {toDateInput(profile.prcLicenseExpiry)} —
              prescriptions are blocked until it is renewed.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="PRC licence number"
              error={errors.prcLicenseNumber?.message}
            >
              <Input
                {...register('prcLicenseNumber')}
                inputMode="numeric"
                placeholder="0123456"
              />
            </FormField>
            <FormField
              label="Valid until"
              error={errors.prcLicenseExpiry?.message}
            >
              <Input type="date" {...register('prcLicenseExpiry')} />
            </FormField>
          </div>
          <FormField label="Specialty" error={errors.prcSpecialty?.message}>
            <Input
              {...register('prcSpecialty')}
              placeholder="General Medicine"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Printed on every prescription you sign, exactly as entered here.
          </p>
        </CardContent>
      </Card>

      {update.error && (
        <p className="text-sm text-destructive">
          {(update.error as Error).message}
        </p>
      )}
      {update.isSuccess && !isDirty && (
        <p className="text-sm text-emerald-700">Profile saved.</p>
      )}
      <Button type="submit" disabled={isSubmitting || update.isPending}>
        {update.isPending ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  );
}
