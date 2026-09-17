'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { Button, PasswordInput } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { useResetPassword } from '../hooks/use-password-reset';

const schema = z
  .object({
    password: z.string().min(8, 'at least 8 characters').max(128),
    confirmPassword: z.string().min(8),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'passwords do not match',
    path: ['confirmPassword'],
  });
type ResetInput = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search?.get('token') ?? '';
  const reset = useResetPassword({
    onSuccess: () => router.replace('/login?reset=1'),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetInput>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        This reset link is missing its token. Request a new one from{' '}
        <Link href="/forgot-password" className="text-primary hover:underline">
          forgot password
        </Link>
        .
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((v) =>
        reset.mutate({ token, password: v.password }),
      )}
      className="space-y-4"
    >
      <FormField label="New password" error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          {...register('password')}
        />
      </FormField>
      <FormField
        label="Confirm password"
        error={errors.confirmPassword?.message}
      >
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          {...register('confirmPassword')}
        />
      </FormField>
      {reset.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{(reset.error as Error).message}</span>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={reset.isPending}>
        {reset.isPending ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  );
}
