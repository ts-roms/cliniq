'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { type Session } from '@/features/auth/session';
import { NotificationsBell } from '@/features/notifications';
import { useTenantSettings } from '@/features/settings';
import { ActingAsPicker } from '@/features/delegations';
import { useT } from '@/shared/i18n';
import { ProfileMenu } from './profile-menu';
import { homeHrefFor } from './side-nav';

export function AppHeader({
  session,
  onOpenDrawer,
}: {
  session: Session;
  onOpenDrawer: () => void;
}) {
  const settings = useTenantSettings();
  const t = useT();

  const branding = settings.data?.settings?.branding;
  const clinicName = settings.data?.name ?? t('app.brand');
  const headerStyle = branding?.primaryColor
    ? ({ '--brand-primary': branding.primaryColor } as React.CSSProperties)
    : undefined;
  const home = homeHrefFor(session.user.role);

  return (
    <header
      className="sticky top-0 z-30 border-b bg-card"
      style={headerStyle}
    >
      <div className="flex h-14 items-center justify-between gap-2 px-4 sm:px-6">
        {/* Left: mobile hamburger + brand (mobile only — sidebar shows brand on desktop) */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Open menu"
            aria-controls="mobile-side-nav"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-foreground hover:bg-muted lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
          <Link
            href={home}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold lg:hidden"
            style={branding?.primaryColor ? { color: branding.primaryColor } : undefined}
          >
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt={clinicName} className="h-6 w-auto" />
            ) : null}
            <span className="truncate">{clinicName}</span>
          </Link>
        </div>

        {/* Right cluster: acting-as (md+) · notifications · profile dropdown (with language inside) */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:block">
            <ActingAsPicker />
          </div>
          <NotificationsBell />
          <ProfileMenu session={session} />
        </div>
      </div>

      {/* Below-header row for ActingAsPicker on small screens so it doesn't crowd avatar/bell */}
      <div className="border-t px-4 py-2 sm:px-6 md:hidden">
        <ActingAsPicker />
      </div>
    </header>
  );
}
