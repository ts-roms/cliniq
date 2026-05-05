'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@org/ui';
import { clearSession, type Session } from '@/features/auth/session';

export function PortalHeader({ session }: { session: Session }) {
  const router = useRouter();
  const signOut = () => {
    clearSession();
    router.replace('/portal/login');
  };
  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex h-14 items-center justify-between px-6">
        <Link href="/portal" className="text-sm font-semibold text-primary">
          ClinIQ · Portal
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/portal" className="text-muted-foreground hover:text-foreground">
            Overview
          </Link>
          <Link href="/portal/appointments" className="text-muted-foreground hover:text-foreground">
            Appointments
          </Link>
          <Link href="/portal/records" className="text-muted-foreground hover:text-foreground">
            Records
          </Link>
          <Link href="/portal/invoices" className="text-muted-foreground hover:text-foreground">
            Invoices
          </Link>
          <span className="text-xs text-muted-foreground">{session.user.email}</span>
          <Button size="sm" variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </nav>
      </div>
    </header>
  );
}
