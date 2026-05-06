import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@org/ui';
import { PlatformLoginForm } from '@/features/platform';

export default function PlatformLoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%)]"
      />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <span className="text-lg font-semibold">P</span>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            ClinIQ Platform
          </p>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-extralight">Operator sign-in</CardTitle>
            <CardDescription>
              Manage tenants, plans, and subscriptions across the SaaS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <PlatformLoginForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Looking for the clinic app?{' '}
          <a href="/login" className="font-medium text-primary hover:underline">
            Clinic sign-in
          </a>
        </p>
      </div>
    </main>
  );
}
