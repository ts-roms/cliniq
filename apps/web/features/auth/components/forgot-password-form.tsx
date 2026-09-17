'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, MailCheck } from 'lucide-react';
import { Button, Input } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { useForgotPassword } from '../hooks/use-password-reset';

const schema = z.object({ email: z.string().email('enter a valid email') });
type ForgotInput = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const forgot = useForgotPassword();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotInput>({ resolver: zodResolver(schema) });

  if (forgot.isSuccess) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <MailCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden
          />
          <p>
            If <span className="font-medium">{getValues('email')}</span> has an
            account, a reset link is on its way. It expires in 30 minutes.
          </p>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((v) => forgot.mutate(v.email))}
      className="space-y-4"
    >
      <FormField label="Email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@clinic.ph"
          {...register('email')}
        />
      </FormField>
      {forgot.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{(forgot.error as Error).message}</span>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={forgot.isPending}>
        {forgot.isPending ? 'Sending…' : 'Send reset link'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
