'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PasswordInput } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  patientSignupSchema,
  type PatientSignupInput,
} from '../schemas/portal';
import { usePortalSignup } from '../hooks/use-me';

export function PortalSignupForm() {
  const router = useRouter();
  const signup = usePortalSignup();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PatientSignupInput>({
    resolver: zodResolver(patientSignupSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    await signup.mutateAsync(values);
    router.replace('/portal');
  });

  return (
    <Card className="mx-auto mt-12 max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl font-extralight">Activate portal account</CardTitle>
        <p className="text-xs text-muted-foreground">
          Use the clinic slug + MRN your provider gave you. Your email must
          match the one on file.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Clinic" error={errors.tenantSlug?.message}>
            <Input placeholder="e.g. quezon-clinic" {...register('tenantSlug')} />
          </FormField>
          <FormField label="MRN" error={errors.mrn?.message}>
            <Input placeholder="MRN-001" {...register('mrn')} />
          </FormField>
          <FormField label="Email on file" error={errors.email?.message}>
            <Input type="email" {...register('email')} />
          </FormField>
          <FormField label="Password (min 8)" error={errors.password?.message}>
            <PasswordInput autoComplete="new-password" {...register('password')} />
          </FormField>
          {signup.error && (
            <p className="text-xs text-destructive">
              {(signup.error as Error).message}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting || signup.isPending} className="w-full">
            {signup.isPending ? 'Creating…' : 'Activate'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Already activated?{' '}
            <a href="/portal/login" className="text-primary underline">
              Sign in
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
