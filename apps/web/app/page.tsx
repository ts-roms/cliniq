import Link from 'next/link';
import { Button } from '@org/ui';
import { AuthAwareCta } from '@/features/marketing/auth-aware-cta';
import { SignupChoiceCta } from '@/features/marketing/signup-choice-cta';

const TITLE = 'ClinIQ — The clinic and dental-lab system with a brain';
const DESCRIPTION =
  'Patients, consultations, prescriptions, telemedicine, HMO claims and inventory for clinics; digital case orders, manufacturing phases and invoicing for dental labs. Built for the Philippines. Free 30-day trial.';

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

/**
 * Two tenant kinds, two feature sets — rendered as labelled groups rather
 * than one blended list, because a clinic never sees the lab half and vice
 * versa. Both lists describe what actually ships (see apps/api/src/lab and
 * libs/shared-types/src/lib/features.ts); marketing copy that outruns the
 * product is how a signup ends in a refund.
 */
const CLINIC_FEATURES: Feature[] = [
  {
    title: 'Patient records',
    body: 'MRN-keyed charts, demographics, allergies, vitals, conditions, and medications — searchable in one place.',
  },
  {
    title: 'AI consultation scribe',
    body: 'Capture the encounter; the AI drafts the SOAP note, ICD-10 suggestions, and Rx — provider always reviews before signing.',
  },
  {
    title: 'PRC-compliant prescriptions',
    body: 'PRC license, specialty, and signature snapshotted onto every Rx PDF. Drug catalog with brand/generic/strength.',
  },
  {
    title: 'Telemedicine',
    body: 'Browser-based video consults with patient consent capture and per-session recording controls.',
  },
  {
    title: 'HMO claims',
    body: 'Track memberships, eligibility, and claim status across the country’s major HMOs without spreadsheets.',
  },
  {
    title: 'Inventory & billing',
    body: 'Stock movements, expiry tracking, invoices, and payments — wired to your consultation workflow.',
  },
];

const LAB_FEATURES: Feature[] = [
  {
    title: 'Digital case orders',
    body: 'Clinics you are linked to submit cases with the product, patient label, and urgency — no more paper slips or phone calls.',
  },
  {
    title: 'Manufacturing phases',
    body: 'Track each case from submitted through in-progress, awaiting pickup, and delivered, with the phases your product actually uses.',
  },
  {
    title: 'Product catalog',
    body: 'Your own categories, products, and pricing — what the clinic picks from when they order, priced the way you quote.',
  },
  {
    title: 'Materials & lot traceability',
    body: 'Record which material lots went into a case, so a conformity question years later has an answer.',
  },
  {
    title: 'Conformity & consent docs',
    body: 'Generate declarations of conformity from your own templates, with e-signature capture on the clinic side.',
  },
  {
    title: 'Invoicing & payment links',
    body: 'Build invoices straight from delivered cases, issue them to the clinic, and collect via PayMongo payment links.',
  },
];

interface Audience {
  title: string;
  body: string;
}

/**
 * Same split as the features section: a clinic and a dental lab are different
 * tenant kinds with different shapes of business. The lab entries track the
 * LabSpecialty enum (single-craft through full-service) and the per-plan
 * limits in libs/shared-types — not invented segments.
 */
const CLINIC_AUDIENCES: Audience[] = [
  {
    title: 'Solo practitioners',
    body: 'Bring your records, scribe, and Rx into one place. No IT team required.',
  },
  {
    title: 'Multi-location clinics',
    body: 'One tenant, many locations. Role-based access for owners, admins, doctors, nurses, and reception.',
  },
  {
    title: 'Specialty practices',
    body: 'Built-in flows for dental charting, pediatrics, OB-GYN, dermatology, cardiology, and psych.',
  },
];

const LAB_AUDIENCES: Audience[] = [
  {
    title: 'Single-craft labs',
    body: 'Crown & bridge, orthodontics, implantology, removable prosthesis, or clear aligners — a catalog shaped around the one thing you do.',
  },
  {
    title: 'Full-service labs',
    body: 'Many products and technicians under one roof, with phase tracking so nobody has to ask where a case is.',
  },
  {
    title: 'Labs with clinic networks',
    body: 'Invite the clinics you already work with; they order, you deliver and invoice, both sides watching the same case.',
  },
];

interface TrustItem {
  title: string;
  body: string;
}

const TRUST: TrustItem[] = [
  {
    title: 'PRC-aware',
    body: 'License number, expiry, and specialty captured per-provider and stamped on every prescription.',
  },
  {
    title: 'DPA-aligned',
    body: 'Patient data subject requests, consent capture, and a tamper-evident audit log out of the box.',
  },
  {
    title: 'PH-first',
    body: 'PHP currency, Asia/Manila timezone, local HMO networks, and SMS-friendly notifications.',
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
            <Link href="/pricing">Pricing</Link>
          </Button>
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
            The clinic and dental-lab system{' '}
            <span className="text-primary">with a brain.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Clinics get patients, consultations, prescriptions, telemedicine,
            HMO claims and inventory, with an AI scribe that drafts the note.
            Dental labs get digital case orders, manufacturing phases and
            invoicing. One system, both sides of the referral.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <SignupChoiceCta className="h-11 w-full px-6 text-base sm:w-auto" />
            <Button
              asChild
              variant="ghost"
              className="h-11 w-full px-6 text-base sm:w-auto"
            >
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
              Everything your clinic or lab runs on, in one place
            </h2>
            <p className="mt-4 text-muted-foreground">
              No more juggling spreadsheets, paper charts, prescription pads —
              or paper case slips between the two.
            </p>
          </div>
          <FeatureGroup label="For clinics" features={CLINIC_FEATURES} />
          <FeatureGroup label="For dental labs" features={LAB_FEATURES} />
        </div>
      </section>

      {/* For whom */}
      <section className="container mx-auto px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extralight tracking-tight sm:text-4xl">
            Built for the clinic or lab you actually run
          </h2>
        </div>
        <AudienceGroup label="For clinics" audiences={CLINIC_AUDIENCES} />
        <AudienceGroup label="For dental labs" audiences={LAB_AUDIENCES} />
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
            Start your clinic or lab on ClinIQ today
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            30 days, full access, no credit card. Bring your team and your
            patients in minutes.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <SignupChoiceCta className="h-11 w-full px-6 text-base sm:w-auto" />
            <Button
              asChild
              variant="ghost"
              className="h-11 w-full px-6 text-base sm:w-auto"
            >
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

/** One labelled half of the features section — see CLINIC_FEATURES. */
function FeatureGroup({
  label,
  features,
}: {
  label: string;
  features: Feature[];
}) {
  return (
    <div className="mx-auto mt-12 max-w-5xl">
      <h3 className="mb-4 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </h3>
      <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <li key={f.title} className="flex flex-col gap-2 bg-background p-6">
            <h4 className="text-base font-semibold">{f.title}</h4>
            <p className="text-sm text-muted-foreground">{f.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One labelled half of the "who it's for" section — see CLINIC_AUDIENCES. */
function AudienceGroup({
  label,
  audiences,
}: {
  label: string;
  audiences: Audience[];
}) {
  return (
    <div className="mx-auto mt-12 max-w-5xl">
      <h3 className="mb-4 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </h3>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {audiences.map((a) => (
          <div
            key={a.title}
            className="rounded-xl border border-border/60 bg-background p-6 shadow-sm"
          >
            <h4 className="text-base font-semibold">{a.title}</h4>
            <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
