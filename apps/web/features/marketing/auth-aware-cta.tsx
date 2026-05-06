'use client';

import Link from 'next/link';
import { Button } from '@org/ui';
import { useSession } from '@/features/auth';

interface Props {
  /** Tailwind classes forwarded to the rendered button. */
  className?: string;
  /** Variant when no session (logged-out). */
  loggedOutVariant?: 'default' | 'outline' | 'ghost';
}

/**
 * Renders "Go to dashboard" when a session exists, otherwise the supplied
 * logged-out CTA. Kept as a tiny client island so the surrounding marketing
 * page stays a static server component.
 */
export function AuthAwareCta({ className, loggedOutVariant = 'default' }: Props) {
  const session = useSession();

  if (session) {
    const href = session.user.role === 'PATIENT' ? '/portal' : '/patients';
    return (
      <Button asChild className={className}>
        <Link href={href}>Go to dashboard</Link>
      </Button>
    );
  }

  return (
    <Button asChild variant={loggedOutVariant} className={className}>
      <Link href="/signup">Start free trial</Link>
    </Button>
  );
}
