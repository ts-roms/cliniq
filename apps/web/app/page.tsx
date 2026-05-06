import Link from 'next/link';
import { Button } from '@org/ui';
import { AuthAwareCta } from '@/features/marketing/auth-aware-cta';

const TITLE = 'ClinIQ — The clinic management system with a brain';
const DESCRIPTION =
  'Patients, consultations, prescriptions, telemedicine, HMO claims, and inventory — built for Philippine clinics. Free 30-day trial.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'ClinIQ',
    type: 'website',
    locale: 'en_PH',
    // images: [{ url: '/og.png', width: 1200, height: 630 }], // TODO: add asset
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    // images: ['/og.png'], // TODO: add asset
  },
};

interface Feature {
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    title: 'Patient records',
    body:
      'MRN-keyed charts, demographics, allergies, vitals, conditions, and medications — searchable in one place.',
  },
  {
    title: 'AI consultation scribe',
    body:
      'Capture the encounter; the AI drafts the SOAP note, ICD-10 suggestions, and Rx — provider always reviews before signing.',
  },
  {
    title: 'PRC-compliant prescriptions',
    body:
      'PRC license, specialty, and signature snapshotted onto every Rx PDF. Drug catalog with brand/generic/strength.',
  },
  {
    title: 'Telemedicine',
    body:
      'Browser-based video consults with patient consent capture and per-session recording controls.',
  },
  {
    title: 'HMO claims',
    body:
      'Track memberships, eligibility, and claim status across the country’s major HMOs without spreadsheets.',
  },
  {
    title: 'Inventory & billing',
    body:
      'Stock movements, expiry tracking, invoices, and payments — wired to your consultation workflow.',
  },
];

interface Audience {
  title: string;
  body: string;
}

const AUDIENCES: Audience[] = [
  {
    title: 'Solo practitioners',
    body:
      'Bring your records, scribe, and Rx into one place. No IT team required.',
  },
  {
    title: 'Multi-location clinics',
    body:
      'One tenant, many locations. Role-based access for owners, admins, doctors, nurses, and reception.',
  },
  {
    title: 'Specialty practices',
    body:
      'Built-in flows for dental charting, pediatrics, OB-GYN, dermatology, cardiology, and psych.',
  },
];

interface TrustItem {
  title: string;
  body: string;
}

const TRUST: TrustItem[] = [
  {
    title: 'PRC-aware',
    body:
      'License number, expiry, and specialty captured per-provider and stamped on every prescription.',
  },
  {
    title: 'DPA-aligned',
    body:
      'Patient data subject requests, consent capture, and a tamper-evident audit log out of the box.',
  },
  {
    title: 'PH-first',
    body:
      'PHP currency, Asia/Manila timezone, local HMO networks, and SMS-friendly notifications.',
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-background">
      {/* Soft radial accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.10),transparent_60%)]"
      />

      {/* Top nav */}
      <header className="container mx-auto flex items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <span className="text-base font-semibold">C</span>
          </span>
          <span className="text-sm font-semibold tracking-wide">ClinIQ</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <AuthAwareCta className="h-9 px-4" />
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 pt-12 pb-20 sm:px-6 sm:pt-20 sm:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extralight tracking-tight sm:text-5xl md:text-6xl">
            The clinic management system{' '}
            <span className="text-primary">with a brain.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Patients, consultations, prescriptions, telemedicine, HMO claims, and
            inventory — in one place, with an AI scribe that drafts the note so
            you can focus on the patient.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AuthAwareCta className="h-11 w-full px-6 text-base sm:w-auto" />
            <Button asChild variant="outline" className="h-11 w-full px-6 text-base sm:w-auto">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Free 30-day trial. No credit card required.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/50 bg-muted/20">
        <div className="container mx-auto px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extralight tracking-tight sm:text-4xl">
              Everything your clinic runs on, in one place
            </h2>
            <p className="mt-4 text-muted-foreground">
              No more juggling spreadsheets, paper charts, and a separate
              prescription pad.
            </p>
          </div>
          <ul className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="flex flex-col gap-2 bg-background p-6"
              >
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* For whom */}
      <section className="container mx-auto px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extralight tracking-tight sm:text-4xl">
            Built for the clinic you actually run
          </h2>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div
              key={a.title}
              className="rounded-xl border border-border/60 bg-background p-6 shadow-sm"
            >
              <h3 className="text-base font-semibold">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t border-border/50 bg-muted/20">
        <div className="container mx-auto px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Compliance &amp; trust
            </p>
            <h2 className="mt-3 text-3xl font-extralight tracking-tight sm:text-4xl">
              Designed for the Philippines
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="text-left">
                <h3 className="text-sm font-semibold">{t.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="container mx-auto px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border/60 bg-background p-10 text-center shadow-sm sm:p-14">
          <h2 className="text-3xl font-extralight tracking-tight sm:text-4xl">
            Start your clinic on ClinIQ today
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            30 days, full access, no credit card. Bring your team and your
            patients in minutes.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AuthAwareCta className="h-11 w-full px-6 text-base sm:w-auto" />
            <Button asChild variant="ghost" className="h-11 w-full px-6 text-base sm:w-auto">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>&copy; {new Date().getFullYear()} ClinIQ. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/portal" className="hover:text-foreground">
              Patient portal
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
