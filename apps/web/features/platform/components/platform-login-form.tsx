'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Button, Input, PasswordInput } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { usePlatformLogin } from '../hooks/use-platform-login';
import { PlatformApiError } from '../lib/api';

interface FormShape {
  email: string;
  password: string;
  mfaCode?: string;
}

export function PlatformLoginForm() {
  const router = useRouter();
  const [needsMfa, setNeedsMfa] = useState(false);
  const login = usePlatformLogin({
    onSuccess: () => router.push('/platform/dashboard'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormShape>();

  const submitting = isSubmitting || login.isPending;

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        try {
          await login.mutateAsync(v);
        } catch (err) {
          if (
            err instanceof PlatformApiError &&
            err.status === 401 &&
            (err.body as { mfaRequired?: boolean } | null)?.mfaRequired
          ) {
            setNeedsMfa(true);
            setError('mfaCode', { message: 'Enter your authenticator code' });
            return;
          }
          // login.error is set by react-query; nothing extra to do
        }
      })}
      className="space-y-4"
    >
      <FormField label="Email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="platform@cliniq.local"
          {...register('email', { required: 'Required' })}
        />
      </FormField>

      <FormField label="Password" error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="Your password"
          {...register('password', { required: 'Required' })}
        />
      </FormField>

      {needsMfa && (
        <FormField label="MFA code" error={errors.mfaCode?.message}>
          <Input
            id="mfaCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            {...register('mfaCode')}
          />
        </FormField>
      )}

      {login.error && !needsMfa && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{(login.error as Error).message || 'Invalid credentials'}</span>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Signing in…' : needsMfa ? 'Verify' : 'Sign in'}
      </Button>
    </form>
  );
}
