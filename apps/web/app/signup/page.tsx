import { Suspense } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@org/ui';
import { SignupForm } from '@/features/onboarding';

export default function SignupPage() {
  return (
    <main className="container mx-auto flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-extralight">Start your clinic</CardTitle>
          <CardDescription>
            Free 30-day trial. Add patients, scribe consultations, prescribe — all in
            one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* SignupForm reads ?plan=… via useSearchParams, which forces a
              client-side render. Suspense boundary lets the page still
              statically prerender the surrounding shell. */}
          <Suspense fallback={<SignupFormSkeleton />}>
            <SignupForm />
          </Suspense>
          <p className="text-center text-xs text-muted-foreground">
            Already have a clinic?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function SignupFormSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-16 rounded-lg border border-border/60 bg-muted/30" />
      <div className="h-9 rounded-md bg-muted/40" />
      <div className="h-9 rounded-md bg-muted/40" />
      <div className="h-9 rounded-md bg-muted/40" />
    </div>
  );
}
