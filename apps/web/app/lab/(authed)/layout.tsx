'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@org/ui';
import { clearSession, useSession } from '@/features/auth';
import { useTenantKind } from '@/features/lab';

const NAV = [
  { href: '/lab/cases', label: 'Cases' },
  { href: '/lab/billing', label: 'Billing' },
  { href: '/lab/stats', label: 'Stats' },
  { href: '/lab/catalog', label: 'Catalog' },
  { href: '/lab/materials', label: 'Materials' },
  { href: '/lab/compliance', label: 'Compliance' },
  { href: '/lab/tags', label: 'Tags' },
  { href: '/lab/clinics', label: 'Clinics' },
];

export default function LabAuthedLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const tenantKind = useTenantKind();
  const router = useRouter();
  const pathname = usePathname();

  // Gate: must be signed in AND a LAB tenant.
  useEffect(() => {
    if (session === null) {
      router.replace('/login');
      return;
    }
    if (tenantKind && tenantKind !== 'LAB') {
      // Clinic users land on the regular app; portal users get bounced to portal.
      router.replace('/dashboard');
    }
  }, [session, tenantKind, router]);

  if (!session || tenantKind !== 'LAB') return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/lab/cases" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-semibold">L</span>
            </span>
            <div>
              <div className="text-sm font-semibold leading-none">ClinIQ Lab</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Laboratory console
              </div>
            </div>
          </Link>

          <nav className="flex flex-1 items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    'rounded-md px-3 py-1.5 text-sm font-medium transition ' +
                    (active
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearSession();
                router.push('/login');
              }}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
