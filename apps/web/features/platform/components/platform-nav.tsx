'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@org/ui';
import { clearPlatformSession } from '../session';
import { usePlatformSession } from '../hooks/use-platform-session';

export function PlatformNav() {
  const pathname = usePathname();
  const router = useRouter();
  const session = usePlatformSession();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/platform/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-semibold">P</span>
          </div>
          <div>
            <div className="text-sm font-semibold leading-none">ClinIQ Platform</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Operator console
            </div>
          </div>
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          <NavLink href="/platform/dashboard" active={isActive('/platform/dashboard')}>
            Tenants
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {session?.admin.email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearPlatformSession();
              router.push('/platform/login');
            }}
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        'rounded-md px-3 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')
      }
    >
      {children}
    </Link>
  );
}
