'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { Button, Input, PasswordInput } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { useAcceptInvite, useInvitePreview } from '../hooks/use-accept-invite';

const schema = z
  .object({
    name: z.string().min(2, 'at least 2 characters').max(120),
    password: z.string().min(8, 'at least 8 characters').max(128),
    confirmPassword: z.string().min(8),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'passwords do not match',
    path: ['confirmPassword'],
  });
type AcceptInput = z.infer<typeof schema>;

function labelRole(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

/**
 * /signup?invite=<token>. Looks the invite up (clinic name, role, locked
 * email), then collects a display name + password and registers through
 * the invite. Nothing here lets the user change which email they join as —
 * the api rejects a mismatch anyway.
 */
export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite({
    onSuccess: (s) =>
      router.push(s.user.tenantKind === 'LAB' ? '/lab/cases' : '/patients'),
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInput>({ resolver: zodResolver(schema) });

  if (preview.isLoading) {
    return <div className="h-24 rounded-md bg-muted/40" aria-hidden />;
  }
  if (preview.error || !preview.data) {
    return (
      <div className="space-y-3 text-sm">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {(preview.error as Error | null)?.message ?? 'Invite not found.'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Ask the person who invited you to send a new link, or{' '}
          <Link href="/login" className="text-primary hover:underline">
            sign in
          </Link>{' '}
          if you already have an account.
        </p>
      </div>
    );
  }

  const invite = preview.data;
  return (
    <form
      onSubmit={handleSubmit((v) =>
        accept.mutate({
          token,
          tenantSlug: invite.tenantSlug,
          email: invite.email,
          name: v.name,
          password: v.password,
        }),
      )}
      className="space-y-4"
    >
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
        <p>
          You&apos;re joining{' '}
          <span className="font-medium">{invite.tenantName}</span> as{' '}
          <span className="font-medium">{labelRole(invite.role)}</span>.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Signing up as <span className="font-mono">{invite.email}</span>
        </p>
      </div>

      <FormField label="Your name" error={errors.name?.message}>
        <Input
          id="name"
          autoComplete="name"
          placeholder="Dr. Maria Cruz"
          {...register('name')}
        />
      </FormField>
      <FormField label="Password" error={errors.password?.message}>
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

      {accept.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{(accept.error as Error).message}</span>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={accept.isPending}>
        {accept.isPending ? 'Joining…' : `Join ${invite.tenantName}`}
      </Button>
    </form>
  );
}
