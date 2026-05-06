import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Button } from '@org/ui';
import {
  ALL_PLANS,
  Features,
  PLAN_META,
  formatPlanPrice,
  type Feature,
  type Plan,
} from '@org/shared-types';

const TITLE = 'Pricing — ClinIQ';
const DESCRIPTION =
  'Simple per-clinic pricing. 30-day free trial on every plan. Switch tiers any time as your clinic grows.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'ClinIQ' },
};

interface FeatureRow {
  id: Feature;
  label: string;
  /** Hide from compact card view (still shown in the comparison table). */
  comparisonOnly?: boolean;
}

const FEATURE_ROWS: FeatureRow[] = [
  { id: Features.CORE_EMR, label: 'Core EMR (patients, consults, Rx, billing)' },
  { id: Features.REPORTS_BASIC, label: 'Basic reports', comparisonOnly: true },
  { id: Features.REPORTS_ADVANCED, label: 'Advanced reports & analytics' },
  { id: Features.INVENTORY, label: 'Inventory management' },
  { id: Features.LABS, label: 'Lab orders & results' },
  { id: Features.HMO, label: 'HMO claims tracking' },
  { id: Features.TELEMEDICINE, label: 'Telemedicine' },
  { id: Features.AI_SOAP, label: 'AI SOAP draft generation' },
  { id: Features.AI_DERMATOLOGY, label: 'AI dermatology assist' },
  { id: Features.WEBHOOKS, label: 'Webhooks for integrations' },
  { id: Features.CALENDAR_SYNC, label: 'External calendar sync' },
  { id: Features.CUSTOM_RETENTION, label: 'Custom data retention policy' },
];

export default function PricingPage() {
  return (
    <main className="relative min-h-screen bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.10),transparent_60%)]"
      />

      <header className="container mx-auto flex items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <span className="text-base font-semibold">C</span>
          </span>
          <span className="text-sm font-semibold tracking-wide">ClinIQ</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">Home</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Start free trial</Link>
          </Button>
        </nav>
      </header>

      <section className="container mx-auto px-4 pt-12 pb-8 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extralight tracking-tight sm:text-5xl">
            Pricing built for Philippine clinics
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Simple per-clinic plans. 30-day free trial on every tier. No credit card to
            start. Upgrade or downgrade any time.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          {ALL_PLANS.map((id) => (
            <PlanCard key={id} plan={id} />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prices in PHP, exclusive of VAT. Annual billing available — contact us for a 20% discount.
        </p>
      </section>

      <section className="border-t border-border/50 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extralight tracking-tight sm:text-4xl">
              Compare every feature
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              All plans include audit logs, MFA, role-based access, and PRC-compliant prescriptions.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-4xl overflow-x-auto rounded-xl border border-border/60 bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    Feature
                  </th>
                  {ALL_PLANS.map((id) => (
                    <th
                      key={id}
                      className="px-5 py-3 text-center text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      {PLAN_META[id].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-5 py-3">{row.label}</td>
                    {ALL_PLANS.map((id) => {
                      const has = PLAN_META[id].features.includes(row.id);
                      return (
                        <td key={id} className="px-5 py-3 text-center">
                          {has ? (
                            <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label="included" />
                          ) : (
                            <X className="mx-auto h-4 w-4 text-muted-foreground/30" aria-label="not included" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-b last:border-0 bg-muted/30">
                  <td className="px-5 py-3 font-medium">Locations included</td>
                  {ALL_PLANS.map((id) => (
                    <td key={id} className="px-5 py-3 text-center font-medium">
                      {Number.isFinite(PLAN_META[id].maxLocations)
                        ? PLAN_META[id].maxLocations
                        : 'Unlimited'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-extralight tracking-tight sm:text-3xl">
            Questions before you start?
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Email{' '}
            <a className="text-primary hover:underline" href="mailto:hello@cliniq.app">
              hello@cliniq.app
            </a>
            {' '}or start a 30-day trial — no credit card required.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild className="h-11 px-6">
              <Link href="/signup">Start free trial</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-6">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const meta = PLAN_META[plan];
  const cardFeatures = FEATURE_ROWS.filter((r) => !r.comparisonOnly);

  return (
    <div
      className={
        'relative flex flex-col rounded-2xl border bg-background p-6 shadow-sm transition ' +
        (meta.highlight
          ? 'border-primary/60 shadow-lg ring-1 ring-primary/20'
          : 'border-border/60 hover:border-border')
      }
    >
      {meta.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
          Most popular
        </span>
      )}

      <div>
        <h3 className="text-lg font-semibold">{meta.label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{meta.tagline}</p>
      </div>

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="text-4xl font-light tracking-tight">{formatPlanPrice(meta)}</span>
        {meta.priceMonthly !== null && (
          <span className="text-sm text-muted-foreground">/ month</span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {Number.isFinite(meta.maxLocations)
          ? `Up to ${meta.maxLocations} location${meta.maxLocations === 1 ? '' : 's'}`
          : 'Unlimited locations'}
      </p>

      <ul className="mt-6 flex-1 space-y-2.5 text-sm">
        {cardFeatures.map((row) => {
          const has = meta.features.includes(row.id);
          return (
            <li
              key={row.id}
              className={'flex items-start gap-2 ' + (has ? '' : 'text-muted-foreground/50')}
            >
              {has ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30" aria-hidden />
              )}
              <span>{row.label}</span>
            </li>
          );
        })}
      </ul>

      <Button
        asChild
        variant={meta.highlight ? 'default' : 'outline'}
        className="mt-8 w-full"
      >
        <Link href={`/signup?plan=${meta.id}`}>{meta.cta ?? 'Start free trial'}</Link>
      </Button>
    </div>
  );
}
