'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Globe, LogOut } from 'lucide-react';
import { clearSession, type Session } from '@/features/auth/session';
import { languages, setLang, useLang, useT, type Lang } from '@/shared/i18n';

function initialsFor(email: string): string {
  // First letter of local-part, uppercased. Two letters if `first.last` shape.
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (local[0] ?? '?').toUpperCase();
}

export function ProfileMenu({ session }: { session: Session }) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click & Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = () => {
    clearSession();
    router.replace('/login');
  };

  const initials = initialsFor(session.user.email);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="group flex items-center gap-2 rounded-full border border-border/60 bg-card px-1.5 py-1 pr-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
          {initials}
        </span>
        <span className="hidden min-w-0 flex-col items-start leading-tight md:flex">
          <span className="max-w-[140px] truncate text-xs font-medium text-foreground">
            {session.user.email}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {session.user.role}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border bg-card shadow-lg"
        >
          <div className="border-b px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('profile.signed_in_as')}
            </p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">
              {session.user.email}
            </p>
            <p className="text-xs text-muted-foreground">{session.user.role}</p>
          </div>

          <div className="border-b px-3 py-3">
            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Globe className="h-3.5 w-3.5" aria-hidden />
              {t('profile.language')}
            </label>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {languages().map((l) => {
                const active = l.code === lang;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code as Lang)}
                    className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t('nav.signout')}
          </button>
        </div>
      )}
    </div>
  );
}
