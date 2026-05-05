'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  PasswordInput,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  patientLoginSchema,
  type PatientLoginInput,
} from '../schemas/portal';
import { usePortalLogin } from '../hooks/use-me';

export function PortalLoginForm() {
  const router = useRouter();
  const login = usePortalLogin();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PatientLoginInput>({
    resolver: zodResolver(patientLoginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    await login.mutateAsync(values);
    router.replace('/portal');
  });

  const submitting = isSubmitting || login.isPending;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
          <span className="text-lg font-semibold">C</span>
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Patient portal
        </p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-extralight">Sign in</CardTitle>
          <CardDescription>
            Access your records, visits, and bills.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField label="Email" error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
              />
            </FormField>

            <FormField label="Password" error={errors.password?.message}>
              <PasswordInput
                id="portal-password"
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register('password')}
              />
            </FormField>

            {login.error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{(login.error as Error).message}</span>
              </div>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        New here?{' '}
        <Link href="/portal/signup" className="font-medium text-primary hover:underline">
          Activate your portal account
        </Link>
      </p>
    </div>
  );
}
