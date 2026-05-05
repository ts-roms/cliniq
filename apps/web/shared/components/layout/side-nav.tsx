'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  Calendar,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Session } from '@/features/auth/session';
import { useTenantSettings } from '@/features/settings';
import { useT } from '@/shared/i18n';

const AUDIT_ROLES = new Set(['OWNER', 'ADMIN']);
const INVENTORY_ROLES = new Set(['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']);
const CLAIMS_ROLES = new Set(['OWNER', 'ADMIN', 'RECEPTIONIST']);

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  show: boolean;
}

export function homeHrefFor(role: string): string {
  return AUDIT_ROLES.has(role) ? '/dashboard' : '/patients';
}

export function SideNav({
  session,
  open,
  onClose,
}: {
  session: Session;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const settings = useTenantSettings();
  const t = useT();

  // Close drawer on route change (mobile)
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Lock body scroll while drawer is open on mobile
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    document.body.style.overflow = open && !isDesktop ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const canSeeAudit = AUDIT_ROLES.has(session.user.role);
  const canSeeInventory = INVENTORY_ROLES.has(session.user.role);
  const canSeeClaims = CLAIMS_ROLES.has(session.user.role);

  const items: NavItem[] = [
    { href: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, show: canSeeAudit },
    { href: '/patients', label: t('nav.patients'), icon: Users, show: true },
    { href: '/schedule', label: t('nav.schedule'), icon: Calendar, show: true },
    { href: '/inventory', label: t('nav.inventory'), icon: Package, show: canSeeInventory },
    { href: '/admin/claims', label: t('nav.claims'), icon: FileText, show: canSeeClaims },
    { href: '/audit', label: t('nav.audit'), icon: ShieldCheck, show: canSeeAudit },
    { href: '/admin/dsr', label: t('nav.dsr'), icon: ClipboardList, show: canSeeAudit },
    { href: '/admin/settings', label: t('nav.settings'), icon: Settings, show: session.user.role === 'OWNER' },
  ].filter((i) => i.show);

  const branding = settings.data?.settings?.branding;
  const clinicName = settings.data?.name ?? t('app.brand');
  const home = homeHrefFor(session.user.role);

  const Brand = (
    <Link
      href={home}
      className="flex min-w-0 items-center gap-2 px-4 py-4"
      style={branding?.primaryColor ? { color: branding.primaryColor } : undefined}
    >
      {branding?.logoUrl ? (
        <img src={branding.logoUrl} alt={clinicName} className="h-7 w-auto" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
          {clinicName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate text-sm font-semibold">{clinicName}</span>
    </Link>
  );

  const NavList = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
      {items.map((i) => {
        const active = pathname === i.href || pathname.startsWith(i.href + '/');
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card lg:flex"
        aria-label="Primary"
      >
        {Brand}
        <div className="px-3">
          <div className="mb-2 border-t border-border/60" />
        </div>
        {NavList}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="fixed inset-0 z-40 cursor-default bg-black/40 lg:hidden"
          />
          <aside
            id="mobile-side-nav"
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-xl lg:hidden"
            aria-label="Primary"
          >
            <div className="flex items-center justify-between pr-2">
              {Brand}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="px-3">
              <div className="mb-2 border-t border-border/60" />
            </div>
            {NavList}
          </aside>
        </>
      )}
    </>
  );
}
