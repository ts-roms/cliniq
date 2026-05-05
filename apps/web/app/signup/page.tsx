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
          <SignupForm />
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
