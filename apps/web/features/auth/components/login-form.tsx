'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { Button, Input, PasswordInput } from '@org/ui';
import { loginSchema, type LoginInput } from '../schemas/login';
import { useLogin } from '../hooks/use-login';
import { FormField } from '@/shared/components/forms/form-field';

export function LoginForm() {
  const router = useRouter();
  const login = useLogin({ onSuccess: () => router.push('/patients') });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const submitting = isSubmitting || login.isPending;

  return (
    <form onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-4">
      <FormField label="Email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@clinic.ph"
          {...register('email')}
        />
      </FormField>

      <FormField label="Password" error={errors.password?.message}>
        <PasswordInput
          id="password"
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
          <span>{(login.error as Error).message || 'Invalid credentials'}</span>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
