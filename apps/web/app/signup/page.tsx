import { Suspense } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@org/ui';
import { SignupEntry, SignupHeading } from '@/features/onboarding';

export default function SignupPage() {
  return (
    <main className="container mx-auto flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* Reads ?kind= / ?invite= like SignupEntry below, so the heading
              matches what the visitor actually clicked. */}
          <Suspense fallback={<HeadingSkeleton />}>
            <SignupHeading />
          </Suspense>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* SignupEntry reads ?plan= / ?invite= via useSearchParams, which
              forces a client-side render. Suspense boundary lets the page
              still statically prerender the surrounding shell. With ?invite=
              it renders the accept-invite form instead of the clinic wizard. */}
          <Suspense fallback={<SignupFormSkeleton />}>
            <SignupEntry />
          </Suspense>
          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function HeadingSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="h-6 w-40 rounded bg-muted/40" />
      <div className="h-4 w-full rounded bg-muted/30" />
    </div>
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
