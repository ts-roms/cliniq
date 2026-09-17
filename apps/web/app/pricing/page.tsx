import Link from 'next/link';
import { Button } from '@org/ui';
import { PricingTabs } from './pricing-tabs';

const TITLE = 'Pricing — ClinIQ';
const DESCRIPTION =
  'Plans for clinics and dental laboratories. 30-day free trial on every tier. Switch any time as you grow.';

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'ClinIQ' },
};

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

      <section className="container mx-auto px-4 pt-12 pb-6 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extralight tracking-tight sm:text-5xl">
            Pricing for the whole care chain
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Plans for clinics and dental labs in one place. Pick your audience below.
            30-day free trial on every tier. No credit card to start.
          </p>
        </div>
      </section>

      <PricingTabs />

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
